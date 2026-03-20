import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { students } from '../../../db/schema/students.js';
import { instructors } from '../../../db/schema/instructors.js';
import { reservationHistory } from '../../../db/schema/reservation-history.js';
import { studentInsights } from '../../../db/schema/student-insights.js';
import { eq, and, sql, desc, gte, lt, lte } from 'drizzle-orm';

// ─── Mock enrollment data (no FSP curriculum API in MVP) ────────────────────
// Maps studentId -> { completedLessons, totalLessons }
const MOCK_ENROLLMENT_DATA: Record<string, { completedLessons: number; totalLessons: number }> = {
  'stu-001': { completedLessons: 16, totalLessons: 40 }, // 40% — early-stage PPL
  'stu-002': { completedLessons: 9, totalLessons: 30 }, // 30% — early IR
  'stu-003': { completedLessons: 38, totalLessons: 40 }, // 95% — checkride ready!
  'stu-004': { completedLessons: 6, totalLessons: 30 }, // 20% — beginner
  'stu-005': { completedLessons: 3, totalLessons: 40 }, // 7.5% — brand new
  'stu-006': { completedLessons: 25, totalLessons: 40 }, // 62.5% — mid-stage
  // Operator 1002
  'stu-101': { completedLessons: 10, totalLessons: 40 },
  'stu-102': { completedLessons: 8, totalLessons: 40 },
  'stu-103': { completedLessons: 4, totalLessons: 40 },
  // Operator 1003
  'stu-201': { completedLessons: 5, totalLessons: 40 },
  'stu-202': { completedLessons: 15, totalLessons: 40 },
};

export interface InactiveStudent {
  studentId: string;
  studentName: string;
  daysSinceLastFlight: number;
  lastFlightDate: string | null;
  totalFlightHours: number;
}

export interface CheckrideReadyStudent {
  studentId: string;
  studentName: string;
  enrollmentProgress: number;
  totalFlightHours: number;
  completedLessons: number;
  totalLessons: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  riskReason: string;
  daysSinceLastFlight: number;
  totalFlightHours: number;
}

export interface InstructorWorkload {
  instructorId: string;
  instructorName: string;
  dailyFlightHours: number;
  weeklyFlightHours: number;
  flightsToday: number;
  flightsThisWeek: number;
}

export interface AllInsights {
  inactive: InactiveStudent[];
  checkrideReady: CheckrideReadyStudent[];
  atRisk: AtRiskStudent[];
  instructorWorkload: InstructorWorkload[];
}

@Injectable()
export class StudentInsightsService {
  private readonly logger = new Logger(StudentInsightsService.name);

  /**
   * Students with no flight in 14+ days AND no upcoming reservation.
   */
  async getInactiveStudents(operatorId: number): Promise<InactiveStudent[]> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Get all students for this operator
    const allStudents = await db.select().from(students).where(eq(students.operatorId, operatorId));

    const result: InactiveStudent[] = [];

    for (const student of allStudents) {
      // Find the latest completed flight
      const [lastFlight] = await db
        .select({
          endTime: reservationHistory.endTime,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            eq(reservationHistory.status, 'completed'),
            lte(reservationHistory.endTime, now),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      // No completed flights at all, or last flight was 14+ days ago
      if (!lastFlight || lastFlight.endTime <= fourteenDaysAgo) {
        // Check for upcoming reservations (any status except cancelled)
        const [upcoming] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(reservationHistory)
          .where(
            and(
              eq(reservationHistory.operatorId, operatorId),
              eq(reservationHistory.studentId, student.id),
              gte(reservationHistory.startTime, now),
              sql`${reservationHistory.status} != 'cancelled'`,
            ),
          );

        if ((upcoming?.count ?? 0) === 0) {
          const daysSince = lastFlight
            ? Math.floor((now.getTime() - lastFlight.endTime.getTime()) / (1000 * 60 * 60 * 24))
            : 999; // Never flown

          result.push({
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`,
            daysSinceLastFlight: daysSince,
            lastFlightDate: lastFlight?.endTime.toISOString() ?? null,
            totalFlightHours: Number(student.totalFlightHours),
          });
        }
      }
    }

    // Sort by days since last flight (most inactive first)
    return result.sort((a, b) => b.daysSinceLastFlight - a.daysSinceLastFlight);
  }

  /**
   * Students at >= 90% enrollment completion — ready for checkride.
   * Uses mock enrollment data to compute progress.
   */
  async getCheckrideReadyStudents(operatorId: number): Promise<CheckrideReadyStudent[]> {
    const allStudents = await db.select().from(students).where(eq(students.operatorId, operatorId));

    const result: CheckrideReadyStudent[] = [];

    for (const student of allStudents) {
      const enrollment = MOCK_ENROLLMENT_DATA[student.id];
      if (!enrollment) continue;

      const progress = (enrollment.completedLessons / enrollment.totalLessons) * 100;

      if (progress >= 90) {
        result.push({
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          enrollmentProgress: Math.round(progress * 100) / 100,
          totalFlightHours: Number(student.totalFlightHours),
          completedLessons: enrollment.completedLessons,
          totalLessons: enrollment.totalLessons,
        });
      }
    }

    // Sort by progress (highest first)
    return result.sort((a, b) => b.enrollmentProgress - a.enrollmentProgress);
  }

  /**
   * Students whose flight gaps are increasing (each gap longer than previous).
   * This indicates a student who is losing momentum.
   */
  async getAtRiskStudents(operatorId: number): Promise<AtRiskStudent[]> {
    const now = new Date();
    const allStudents = await db.select().from(students).where(eq(students.operatorId, operatorId));

    const result: AtRiskStudent[] = [];

    for (const student of allStudents) {
      // Get the student's completed flights in chronological order
      const flights = await db
        .select({
          startTime: reservationHistory.startTime,
          endTime: reservationHistory.endTime,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            eq(reservationHistory.status, 'completed'),
            lte(reservationHistory.endTime, now),
          ),
        )
        .orderBy(reservationHistory.endTime);

      // Need at least 3 flights to detect increasing gaps
      if (flights.length < 3) continue;

      // Calculate gaps between consecutive flights (in days)
      const gaps: number[] = [];
      for (let i = 1; i < flights.length; i++) {
        const gap =
          (flights[i]!.startTime.getTime() - flights[i - 1]!.endTime.getTime()) /
          (1000 * 60 * 60 * 24);
        gaps.push(gap);
      }

      // Check if gaps are strictly increasing (each gap longer than previous)
      let isIncreasing = true;
      for (let i = 1; i < gaps.length; i++) {
        if (gaps[i]! <= gaps[i - 1]!) {
          isIncreasing = false;
          break;
        }
      }

      if (isIncreasing) {
        const lastFlight = flights[flights.length - 1]!;
        const daysSinceLastFlight = Math.floor(
          (now.getTime() - lastFlight.endTime.getTime()) / (1000 * 60 * 60 * 24),
        );

        const lastGap = Math.round(gaps[gaps.length - 1]!);
        const firstGap = Math.round(gaps[0]!);

        result.push({
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          riskReason: `Flight gaps increasing: ${firstGap}d -> ${lastGap}d between sessions. Training momentum declining.`,
          daysSinceLastFlight,
          totalFlightHours: Number(student.totalFlightHours),
        });
      }
    }

    // Sort by days since last flight (most concerning first)
    return result.sort((a, b) => b.daysSinceLastFlight - a.daysSinceLastFlight);
  }

  /**
   * Per-instructor daily/weekly flight hours from reservation_history.
   */
  async getInstructorWorkload(operatorId: number): Promise<InstructorWorkload[]> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    // Start of current week (Monday)
    const startOfWeek = new Date(startOfToday);
    const dayOfWeek = startOfToday.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);

    // Get all active instructors for this operator
    const allInstructors = await db
      .select()
      .from(instructors)
      .where(and(eq(instructors.operatorId, operatorId), eq(instructors.isActive, true)));

    const result: InstructorWorkload[] = [];

    for (const instructor of allInstructors) {
      // Today's flights
      const todayFlights = await db
        .select({
          startTime: reservationHistory.startTime,
          endTime: reservationHistory.endTime,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            gte(reservationHistory.startTime, startOfToday),
            lt(reservationHistory.startTime, endOfToday),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        );

      // This week's flights
      const weekFlights = await db
        .select({
          startTime: reservationHistory.startTime,
          endTime: reservationHistory.endTime,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            gte(reservationHistory.startTime, startOfWeek),
            lt(reservationHistory.startTime, endOfToday),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        );

      const dailyHours = todayFlights.reduce((sum, f) => {
        return sum + (f.endTime.getTime() - f.startTime.getTime()) / (1000 * 60 * 60);
      }, 0);

      const weeklyHours = weekFlights.reduce((sum, f) => {
        return sum + (f.endTime.getTime() - f.startTime.getTime()) / (1000 * 60 * 60);
      }, 0);

      result.push({
        instructorId: instructor.id,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        dailyFlightHours: Math.round(dailyHours * 10) / 10,
        weeklyFlightHours: Math.round(weeklyHours * 10) / 10,
        flightsToday: todayFlights.length,
        flightsThisWeek: weekFlights.length,
      });
    }

    // Sort by weekly hours descending (busiest first)
    return result.sort((a, b) => b.weeklyFlightHours - a.weeklyFlightHours);
  }

  /**
   * Returns combined insights for an operator.
   */
  async getAllInsights(operatorId: number): Promise<AllInsights> {
    const [inactive, checkrideReady, atRisk, instructorWorkload] = await Promise.all([
      this.getInactiveStudents(operatorId),
      this.getCheckrideReadyStudents(operatorId),
      this.getAtRiskStudents(operatorId),
      this.getInstructorWorkload(operatorId),
    ]);

    return { inactive, checkrideReady, atRisk, instructorWorkload };
  }

  /**
   * Recompute and cache insights in the student_insights table.
   * Called by POST /api/v1/insights/refresh.
   */
  async refreshInsights(operatorId: number): Promise<AllInsights> {
    const insights = await this.getAllInsights(operatorId);
    const now = new Date();

    // Clear existing insights for this operator
    await db.delete(studentInsights).where(eq(studentInsights.operatorId, operatorId));

    // Get all students for this operator for the full cache
    const allStudents = await db.select().from(students).where(eq(students.operatorId, operatorId));

    const inactiveIds = new Set(insights.inactive.map((s) => s.studentId));
    const checkrideIds = new Set(insights.checkrideReady.map((s) => s.studentId));
    const atRiskMap = new Map(insights.atRisk.map((s) => [s.studentId, s]));

    const rows = allStudents.map((student) => {
      const inactiveEntry = insights.inactive.find((s) => s.studentId === student.id);
      const checkrideEntry = insights.checkrideReady.find((s) => s.studentId === student.id);
      const atRiskEntry = atRiskMap.get(student.id);
      const enrollment = MOCK_ENROLLMENT_DATA[student.id];
      const progress = enrollment
        ? Math.round((enrollment.completedLessons / enrollment.totalLessons) * 10000) / 100
        : null;

      return {
        operatorId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        lastFlightDate: inactiveEntry?.lastFlightDate
          ? new Date(inactiveEntry.lastFlightDate)
          : null,
        nextFlightDate: null as Date | null, // Would be populated from upcoming reservations
        daysSinceLastFlight: inactiveEntry?.daysSinceLastFlight ?? null,
        totalFlightHours: String(student.totalFlightHours),
        enrollmentProgress: progress !== null ? String(progress) : null,
        isInactive: inactiveIds.has(student.id),
        isCheckrideReady: checkrideIds.has(student.id),
        isAtRisk: atRiskMap.has(student.id),
        riskReason: atRiskEntry?.riskReason ?? null,
        computedAt: now,
      };
    });

    if (rows.length > 0) {
      await db.insert(studentInsights).values(rows);
    }

    this.logger.log(
      `Refreshed insights for operator ${operatorId}: ` +
        `${insights.inactive.length} inactive, ` +
        `${insights.checkrideReady.length} checkride-ready, ` +
        `${insights.atRisk.length} at-risk`,
    );

    return insights;
  }
}
