import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  students,
  instructors,
  aircraft,
  activityTypes,
  reservationHistory,
} from '../../../db/schema/index.js';
import { eq, and, desc, asc, gt, ilike } from 'drizzle-orm';

export interface StudentFlightStats {
  /** Hours since student's last completed flight. null if no history. */
  timeSinceLastFlight: number | null;
  /** Hours until student's next scheduled reservation. null if none. */
  timeUntilNextFlight: number | null;
  /** Total flight hours logged by the student. */
  totalHours: number;
}

@Injectable()
export class ResourceLookupService {
  private readonly logger = new Logger(ResourceLookupService.name);

  /**
   * Get flight stats for a student from reservation_history + students tables.
   */
  async getStudentFlightStats(operatorId: number, studentId: string): Promise<StudentFlightStats> {
    const now = new Date();

    // Get totalFlightHours from students table
    const [student] = await db
      .select({ totalFlightHours: students.totalFlightHours })
      .from(students)
      .where(and(eq(students.operatorId, operatorId), eq(students.id, studentId)))
      .limit(1);

    const totalHours = student ? Number(student.totalFlightHours) : 0;

    // Last completed flight
    const [lastFlight] = await db
      .select({ endTime: reservationHistory.endTime })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          eq(reservationHistory.studentId, studentId),
          eq(reservationHistory.status, 'completed'),
        ),
      )
      .orderBy(desc(reservationHistory.endTime))
      .limit(1);

    const timeSinceLastFlight = lastFlight
      ? (now.getTime() - lastFlight.endTime.getTime()) / (1000 * 60 * 60)
      : null;

    // Next upcoming reservation (start time in the future)
    const [nextFlight] = await db
      .select({ startTime: reservationHistory.startTime })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          eq(reservationHistory.studentId, studentId),
          gt(reservationHistory.startTime, now),
        ),
      )
      .orderBy(asc(reservationHistory.startTime))
      .limit(1);

    const timeUntilNextFlight = nextFlight
      ? (nextFlight.startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      : null;

    return { timeSinceLastFlight, timeUntilNextFlight, totalHours };
  }

  /**
   * Resolve a student name (e.g. "Alex Johnson") to their student ID.
   */
  async getStudentByName(operatorId: number, fullName: string): Promise<string | null> {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const firstName = parts[0]!;
    const lastName = parts.slice(1).join(' ');

    const [result] = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.operatorId, operatorId),
          ilike(students.firstName, firstName),
          ilike(students.lastName, lastName),
        ),
      )
      .limit(1);

    return result?.id ?? null;
  }

  /**
   * Resolve an instructor name (e.g. "James Wilson") to their instructor ID.
   */
  async getInstructorByName(operatorId: number, fullName: string): Promise<string | null> {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const firstName = parts[0]!;
    const lastName = parts.slice(1).join(' ');

    const [result] = await db
      .select({ id: instructors.id })
      .from(instructors)
      .where(
        and(
          eq(instructors.operatorId, operatorId),
          ilike(instructors.firstName, firstName),
          ilike(instructors.lastName, lastName),
        ),
      )
      .limit(1);

    return result?.id ?? null;
  }

  /**
   * Resolve an aircraft display string (e.g. "N172SP - Cessna 172S Skyhawk SP" or "N172SP")
   * to the aircraft ID.
   */
  async getAircraftByRegistration(operatorId: number, displayName: string): Promise<string | null> {
    // Extract registration from display name — it's the first token before " - "
    const registration = displayName.split(' - ')[0]!.trim();

    const [result] = await db
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(and(eq(aircraft.operatorId, operatorId), eq(aircraft.registration, registration)))
      .limit(1);

    return result?.id ?? null;
  }

  /**
   * Resolve an activity type name (e.g. "Private Pilot Training") to the activity type ID.
   */
  async getActivityTypeByName(operatorId: number, name: string): Promise<string | null> {
    const [result] = await db
      .select({ id: activityTypes.id })
      .from(activityTypes)
      .where(and(eq(activityTypes.operatorId, operatorId), ilike(activityTypes.name, name)))
      .limit(1);

    return result?.id ?? null;
  }

  /**
   * Get flight stats for multiple students at once (batch query, more efficient).
   */
  async getBatchStudentFlightStats(
    operatorId: number,
    studentIds: string[],
  ): Promise<Map<string, StudentFlightStats>> {
    const result = new Map<string, StudentFlightStats>();

    // Parallel queries for all students
    const promises = studentIds.map(async (sid) => {
      const stats = await this.getStudentFlightStats(operatorId, sid);
      result.set(sid, stats);
    });

    await Promise.all(promises);
    return result;
  }
}
