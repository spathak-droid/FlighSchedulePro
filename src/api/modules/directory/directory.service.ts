import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { students } from '../../../db/schema/students.js';
import { instructors } from '../../../db/schema/instructors.js';
import { aircraft } from '../../../db/schema/aircraft.js';
import { reservationHistory } from '../../../db/schema/reservation-history.js';
import { studentInsights } from '../../../db/schema/student-insights.js';
import { eq, and, sql, desc, gte, count } from 'drizzle-orm';
import { MOCK_AIRCRAFT_TIMES, MOCK_AIRCRAFT_SQUAWKS, MOCK_AVAILABILITY } from '../../fsp/mock/mock-data.js';
import { EmailService } from '../notifications/email.service.js';

// ─── Mock enrollment data (same as student-insights.service.ts) ──────────────
const MOCK_ENROLLMENT_DATA: Record<string, { completedLessons: number; totalLessons: number }> = {
  'stu-001': { completedLessons: 16, totalLessons: 40 },
  'stu-002': { completedLessons: 9, totalLessons: 30 },
  'stu-003': { completedLessons: 38, totalLessons: 40 },
  'stu-004': { completedLessons: 6, totalLessons: 30 },
  'stu-005': { completedLessons: 3, totalLessons: 40 },
  'stu-006': { completedLessons: 25, totalLessons: 40 },
  'stu-101': { completedLessons: 10, totalLessons: 40 },
  'stu-102': { completedLessons: 8, totalLessons: 40 },
  'stu-103': { completedLessons: 4, totalLessons: 40 },
  'stu-201': { completedLessons: 5, totalLessons: 40 },
  'stu-202': { completedLessons: 15, totalLessons: 40 },
};

/** Convert "07:00:00" or "17:00:00" to "7:00 AM" / "5:00 PM". */
function formatTimeDisplay(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr!, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Returns enriched student directory for an operator.
   */
  async getStudents(operatorId: number) {
    const now = new Date();

    // 1. Get all students for this operator
    const allStudents = await db.select().from(students).where(eq(students.operatorId, operatorId));

    // Pre-fetch all instructors for name lookups
    const allInstructors = await db
      .select()
      .from(instructors)
      .where(eq(instructors.operatorId, operatorId));
    const instructorMap = new Map(allInstructors.map((i) => [i.id, `${i.firstName} ${i.lastName}`]));

    // Pre-fetch student insights for this operator
    const allInsights = await db
      .select()
      .from(studentInsights)
      .where(eq(studentInsights.operatorId, operatorId));
    const insightsMap = new Map(allInsights.map((si) => [si.studentId, si]));

    const enriched = [];

    for (const student of allStudents) {
      // 2. Query reservationHistory for flight stats
      const [flightCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            eq(reservationHistory.status, 'completed'),
          ),
        );

      const [lastFlight] = await db
        .select({ endTime: reservationHistory.endTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            eq(reservationHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      const [nextFlight] = await db
        .select({ startTime: reservationHistory.startTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            gte(reservationHistory.startTime, now),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        )
        .orderBy(reservationHistory.startTime)
        .limit(1);

      // Recent instructor (from most recent completed reservation)
      const [recentRes] = await db
        .select({ instructorId: reservationHistory.instructorId })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, student.id),
            eq(reservationHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      // 3. Student insights
      const insight = insightsMap.get(student.id);

      // 4. Enrollment data
      const enrollment = MOCK_ENROLLMENT_DATA[student.id];
      const enrollmentProgress = enrollment
        ? Math.round((enrollment.completedLessons / enrollment.totalLessons) * 10000) / 100
        : null;

      // 5. Instructor name lookup
      const recentInstructorId = recentRes?.instructorId ?? null;
      const recentInstructorName = recentInstructorId
        ? instructorMap.get(recentInstructorId) ?? null
        : null;

      enriched.push({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        totalFlightHours: Number(student.totalFlightHours),
        totalFlights: flightCount?.total ?? 0,
        lastFlightDate: lastFlight?.endTime?.toISOString() ?? null,
        nextFlightDate: nextFlight?.startTime?.toISOString() ?? null,
        recentInstructorId,
        recentInstructorName,
        enrollmentProgress,
        completedLessons: enrollment?.completedLessons ?? null,
        totalLessons: enrollment?.totalLessons ?? null,
        isCheckrideReady: insight?.isCheckrideReady ?? false,
        isAtRisk: insight?.isAtRisk ?? false,
        riskReason: insight?.riskReason ?? null,
        isInactive: insight?.isInactive ?? false,
        locationId: student.locationId,
      });
    }

    this.logger.log(`Fetched ${enriched.length} students for operator ${operatorId}`);
    return enriched;
  }

  /**
   * Returns enriched instructor directory for an operator.
   */
  async getInstructors(operatorId: number) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allInstructors = await db
      .select()
      .from(instructors)
      .where(eq(instructors.operatorId, operatorId));

    const enriched = [];

    for (const instructor of allInstructors) {
      // Total completed flights
      const [flightCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            eq(reservationHistory.status, 'completed'),
          ),
        );

      // Total hours from completed flights
      const [hoursResult] = await db
        .select({
          totalHours: sql<number>`coalesce(sum(extract(epoch from (${reservationHistory.endTime} - ${reservationHistory.startTime})) / 3600), 0)::float`,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            eq(reservationHistory.status, 'completed'),
          ),
        );

      // Active student count (distinct students in last 30 days)
      const [activeStudents] = await db
        .select({ count: sql<number>`count(distinct ${reservationHistory.studentId})::int` })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            gte(reservationHistory.startTime, thirtyDaysAgo),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        );

      // Last flight date
      const [lastFlight] = await db
        .select({ endTime: reservationHistory.endTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            eq(reservationHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      // Next flight date
      const [nextFlight] = await db
        .select({ startTime: reservationHistory.startTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.instructorId, instructor.id),
            gte(reservationHistory.startTime, now),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        )
        .orderBy(reservationHistory.startTime)
        .limit(1);

      // Availability schedule
      const avail = MOCK_AVAILABILITY[instructor.id];
      const availability = (avail?.availabilities ?? []).map((a) => ({
        dayOfWeek: a.dayOfWeek,
        start: formatTimeDisplay(a.startAtTimeUtc),
        end: formatTimeDisplay(a.endAtTimeUtc),
      }));

      enriched.push({
        id: instructor.id,
        firstName: instructor.firstName,
        lastName: instructor.lastName,
        instructorType: instructor.instructorType,
        isActive: instructor.isActive,
        totalFlights: flightCount?.total ?? 0,
        totalHours: Math.round((hoursResult?.totalHours ?? 0) * 10) / 10,
        activeStudentCount: activeStudents?.count ?? 0,
        lastFlightDate: lastFlight?.endTime?.toISOString() ?? null,
        nextFlightDate: nextFlight?.startTime?.toISOString() ?? null,
        availability,
        locationId: instructor.locationId,
      });
    }

    this.logger.log(`Fetched ${enriched.length} instructors for operator ${operatorId}`);
    return enriched;
  }

  /**
   * Returns enriched aircraft directory for an operator.
   */
  async getAircraft(operatorId: number) {
    const now = new Date();

    const allAircraft = await db
      .select()
      .from(aircraft)
      .where(eq(aircraft.operatorId, operatorId));

    const enriched = [];

    for (const ac of allAircraft) {
      // Total completed flights
      const [flightCount] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.aircraftId, ac.id),
            eq(reservationHistory.status, 'completed'),
          ),
        );

      // Total hours
      const [hoursResult] = await db
        .select({
          totalHours: sql<number>`coalesce(sum(extract(epoch from (${reservationHistory.endTime} - ${reservationHistory.startTime})) / 3600), 0)::float`,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.aircraftId, ac.id),
            eq(reservationHistory.status, 'completed'),
          ),
        );

      // Last flight date
      const [lastFlight] = await db
        .select({ endTime: reservationHistory.endTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.aircraftId, ac.id),
            eq(reservationHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      // Next flight date
      const [nextFlight] = await db
        .select({ startTime: reservationHistory.startTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.aircraftId, ac.id),
            gte(reservationHistory.startTime, now),
            sql`${reservationHistory.status} != 'cancelled'`,
          ),
        )
        .orderBy(reservationHistory.startTime)
        .limit(1);

      // Mock aircraft times data
      const mockTimes = MOCK_AIRCRAFT_TIMES[ac.id];

      // Mock squawks data
      const mockSquawks = MOCK_AIRCRAFT_SQUAWKS[ac.id] ?? [];
      const openSquawkCount = mockSquawks.filter(
        (s) => s.status === 'open' || s.status === 'deferred',
      ).length;

      enriched.push({
        id: ac.id,
        registration: ac.registration,
        makeModel: ac.makeModel,
        isSimulator: ac.isSimulator,
        isActive: ac.isActive,
        totalFlights: flightCount?.total ?? 0,
        totalHours: Math.round((hoursResult?.totalHours ?? 0) * 10) / 10,
        lastFlightDate: lastFlight?.endTime?.toISOString() ?? null,
        nextFlightDate: nextFlight?.startTime?.toISOString() ?? null,
        hobbs: mockTimes?.hobbs ?? null,
        tach: mockTimes?.tach ?? null,
        totalTime: mockTimes?.totalTime ?? null,
        openSquawkCount,
      });
    }

    this.logger.log(`Fetched ${enriched.length} aircraft for operator ${operatorId}`);
    return enriched;
  }

  /**
   * Sends an ad-hoc email via Resend.
   */
  async sendEmail(
    operatorId: number,
    recipientEmail: string,
    recipientName: string,
    subject: string,
    body: string,
  ) {
    this.logger.log(
      `Sending email for operator ${operatorId} to ${recipientEmail} (${recipientName})`,
    );

    const html = `<p>Hi ${recipientName},</p>${body}`;

    const result = await this.emailService.sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    return result;
  }

  /**
   * Returns locations for an operator.
   */
  async getLocations(operatorId: number) {
    const { getLocationsForOperator } = await import('../../fsp/mock/mock-data.js');
    return getLocationsForOperator(operatorId);
  }
}
