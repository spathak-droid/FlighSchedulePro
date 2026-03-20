/**
 * Schedule Solver Service — constraint-satisfaction solver for flight scheduling.
 *
 * Provides three core operations:
 * - findTime: Find available slots for a student + activity with real DB conflict checking
 * - optimizeDay: Analyze a day's resource utilization and suggest improvements
 * - batchCreateReservations: Create reservations from approved suggestions
 *
 * All operations query real data from DB tables (students, instructors, aircraft,
 * reservation_history) and record audit trails in solver_runs.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  students,
  instructors,
  aircraft,
  reservationHistory,
  suggestions,
  solverRuns,
} from '../../../db/schema/index.js';
import { eq, and, gte, lte, lt, or, sql, inArray } from 'drizzle-orm';
import type { FoundSlot } from '../../../core/scheduling/slot-finder.js';
import { FspResourceService } from '../../fsp/fsp-resource.service.js';
import type { FspAvailability, FspAvailabilityEntry, FspAvailabilityOverride } from '../../fsp/fsp.types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FindTimeQuery {
  studentId: string;
  activityTypeId: string;
  dateRangeStart: string; // ISO date string YYYY-MM-DD
  dateRangeEnd: string;   // ISO date string YYYY-MM-DD
  preferredInstructorId?: string;
  preferredAircraftId?: string;
  durationMinutes: number;
}

export interface OptimizeDayResult {
  date: string;
  aircraftUtilization: Array<{
    id: string;
    registration: string;
    hoursUsed: number;
    hoursAvailable: number;
    pct: number;
  }>;
  instructorUtilization: Array<{
    id: string;
    name: string;
    hoursUsed: number;
    hoursAvailable: number;
    pct: number;
  }>;
  totalGapMinutes: number;
  optimizationSuggestions: string[];
}

export interface BatchCreateResult {
  created: number;
  failed: Array<{ id: string; error: string }>;
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ReservationConflict {
  startTime: Date;
  endTime: Date;
  instructorId: string | null;
  aircraftId: string | null;
}

interface InstructorRecord {
  id: string;
  operatorId: number;
  firstName: string;
  lastName: string;
  instructorType: string | null;
  isActive: boolean | null;
}

interface AircraftRecord {
  id: string;
  operatorId: number;
  registration: string;
  makeModel: string | null;
  isSimulator: boolean | null;
  isActive: boolean | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Earliest slot start time (7:00 AM local). */
const DAY_START_HOUR = 7;
/** Latest slot start time (6:00 PM local — slots ending after this are OK). */
const DAY_END_HOUR = 18;
/** Slot interval for candidate generation (30 minutes). */
const SLOT_INTERVAL_MINUTES = 30;
/** Default max results to return. */
const DEFAULT_MAX_RESULTS = 10;
/** Assumed operational hours per day for utilization calculations. */
const OPERATIONAL_HOURS_PER_DAY = 11; // 7am - 6pm
/** Hardcoded civil twilight boundaries for daylight check. */
const SUNRISE_HOUR = 6;
const SUNRISE_MINUTE = 30;
const SUNSET_HOUR = 18;
const SUNSET_MINUTE = 0;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ScheduleSolverService {
  private readonly logger = new Logger(ScheduleSolverService.name);

  constructor(private readonly fspResourceService: FspResourceService) {}

  /**
   * Find available time slots for a specific student + activity.
   *
   * This is a genuine constraint-satisfaction solver that:
   * 1. Loads all instructors and aircraft for the operator from DB
   * 2. Queries reservation_history for conflicts in the date range
   * 3. Fetches per-instructor availability from FSP (when token provided)
   * 4. Generates candidate slots within each instructor's availability windows
   * 5. Checks instructor, aircraft, and student conflicts against real reservations
   * 6. Enforces daylight constraint (civil twilight)
   * 7. Scores slots by instructor continuity, aircraft preference, and time
   * 8. Records the solver run for audit trail
   */
  async findTime(operatorId: number, query: FindTimeQuery, fspToken?: string): Promise<FoundSlot[]> {
    const startMs = Date.now();
    this.logger.log(
      `[findTime] operator=${operatorId} student=${query.studentId} ` +
      `range=${query.dateRangeStart}..${query.dateRangeEnd} duration=${query.durationMinutes}min ` +
      `fspToken=${fspToken !== undefined ? 'provided' : 'none'}`,
    );

    const rangeStart = new Date(query.dateRangeStart + 'T00:00:00');
    const rangeEnd = new Date(query.dateRangeEnd + 'T23:59:59');
    rangeEnd.setHours(23, 59, 59, 999);

    // 1. Load all active instructors for this operator
    const allInstructors = await db
      .select()
      .from(instructors)
      .where(and(
        eq(instructors.operatorId, operatorId),
        eq(instructors.isActive, true),
      ));

    // 2. Load all active, non-simulator aircraft for this operator
    const allAircraft = await db
      .select()
      .from(aircraft)
      .where(and(
        eq(aircraft.operatorId, operatorId),
        eq(aircraft.isActive, true),
        eq(aircraft.isSimulator, false),
      ));

    if (allInstructors.length === 0 || allAircraft.length === 0) {
      this.logger.warn(`[findTime] No active instructors or aircraft for operator ${operatorId}`);
      await this.recordSolverRun(operatorId, 'find_time', query, 0, Date.now() - startMs);
      return [];
    }

    // 3. Load all existing reservations in the date range (for conflict checking)
    const existingReservations = await this.loadReservations(operatorId, rangeStart, rangeEnd);

    // 4. Determine the student's recent instructor for continuity scoring
    const lastInstructorId = await this.getStudentLastInstructor(operatorId, query.studentId);

    // 5. Prioritize preferred instructor if specified, then last instructor
    const sortedInstructors = this.prioritizeInstructors(
      allInstructors,
      query.preferredInstructorId,
      lastInstructorId,
    );

    // 6. Prioritize preferred aircraft if specified
    const sortedAircraft = this.prioritizeAircraft(allAircraft, query.preferredAircraftId);

    // 6b. Fetch per-instructor availability from FSP if token is provided (even empty string in mock mode)
    let availabilityMap = new Map<string, FspAvailability>();
    if (fspToken !== undefined) {
      try {
        const instructorIds = sortedInstructors.map((i) => i.id);
        const availabilities = await this.fspResourceService.getAvailability(
          operatorId,
          fspToken,
          {
            userGuidIds: instructorIds,
            startAtUtc: query.dateRangeStart,
            endAtUtc: query.dateRangeEnd,
          },
        );
        for (const avail of availabilities) {
          availabilityMap.set(avail.userGuidId, avail);
        }
        this.logger.log(
          `[findTime] Loaded availability for ${availabilityMap.size} instructors`,
        );
      } catch (error) {
        this.logger.warn(
          `[findTime] Failed to fetch availability, falling back to default windows: ${error instanceof Error ? error.message : error}`,
        );
        availabilityMap = new Map();
      }
    }

    // 7. Generate and score candidate slots
    const foundSlots: FoundSlot[] = [];
    // Track per-instructor last emitted slot end time to prevent overlapping suggestions
    const instructorLastSlotEnd = new Map<string, Date>();

    const currentDate = new Date(rangeStart);
    this.logger.debug(
      `[findTime] rangeStart=${rangeStart.toLocaleDateString()} (${rangeStart.getDay()}) ` +
      `rangeEnd=${rangeEnd.toLocaleDateString()} availMap.size=${availabilityMap.size}`,
    );
    while (currentDate <= rangeEnd && foundSlots.length < DEFAULT_MAX_RESULTS * 3) {
      for (const instructor of sortedInstructors) {
        // Generate candidates per-instructor based on their availability
        const instructorAvail = availabilityMap.get(instructor.id);
        const dayCandidates = this.generateDayCandidates(
          currentDate,
          query.durationMinutes,
          instructorAvail,
        );
        if (dayCandidates.length > 0) {
          this.logger.debug(
            `[findTime] ${currentDate.toLocaleDateString()} dow=${currentDate.getDay()} ` +
            `${instructor.firstName} ${instructor.lastName}: ${dayCandidates.length} candidates ` +
            `(hasAvail=${!!instructorAvail})`,
          );
        }

        // Track the last accepted slot end time per instructor so we don't
        // emit overlapping alternatives (e.g. 9:00-10:00 AND 9:30-10:30).
        // Each emitted slot represents a genuinely independent booking option.
        let instructorBusyUntil = instructorLastSlotEnd.get(instructor.id) ?? new Date(0);

        for (const candidate of dayCandidates) {
          // Skip if this slot overlaps with the last accepted slot for this instructor
          if (candidate.start < instructorBusyUntil) continue;

          // Check daylight constraint
          if (!this.isDaylight(candidate.start, candidate.end)) continue;

          // Check instructor conflict with existing reservations
          if (this.hasResourceConflict(
            candidate.start, candidate.end, instructor.id, 'instructor', existingReservations,
          )) continue;

          // Check student conflict
          if (this.hasStudentConflict(
            candidate.start, candidate.end, query.studentId, existingReservations,
          )) continue;

          // Find first available aircraft (no conflict)
          let bestCraft: typeof sortedAircraft[0] | null = null;
          for (const craft of sortedAircraft) {
            if (!this.hasResourceConflict(
              candidate.start, candidate.end, craft.id, 'aircraft', existingReservations,
            )) {
              bestCraft = craft;
              break;
            }
          }
          if (!bestCraft) continue; // No aircraft available at this time

          // Mark this instructor busy until this slot ends
          instructorBusyUntil = candidate.end;
          instructorLastSlotEnd.set(instructor.id, candidate.end);

          // Score the slot
          const score = this.scoreSlot(
            instructor.id,
            bestCraft.id,
            candidate.start,
            query.preferredInstructorId,
            query.preferredAircraftId,
            lastInstructorId,
          );

          foundSlots.push({
            start: candidate.start,
            end: candidate.end,
            instructorId: instructor.id,
            instructorName: `${instructor.firstName} ${instructor.lastName}`,
            aircraftId: bestCraft.id,
            aircraftRegistration: bestCraft.registration,
            matchScore: score,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by score descending, then by start time ascending
    foundSlots.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.start.getTime() - b.start.getTime();
    });

    const results = foundSlots.slice(0, DEFAULT_MAX_RESULTS);
    const duration = Date.now() - startMs;

    await this.recordSolverRun(operatorId, 'find_time', query, results.length, duration);

    this.logger.log(
      `[findTime] Found ${results.length} slots in ${duration}ms (scanned ${foundSlots.length} candidates)`,
    );

    return results;
  }

  /**
   * Analyze a day's schedule utilization and suggest optimizations.
   *
   * Calculates aircraft and instructor utilization percentages,
   * identifies gaps, and generates actionable suggestions.
   */
  async optimizeDay(operatorId: number, date: string): Promise<OptimizeDayResult> {
    const startMs = Date.now();
    this.logger.log(`[optimizeDay] operator=${operatorId} date=${date}`);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Load all reservations for the day
    const dayReservations = await this.loadReservations(operatorId, dayStart, dayEnd);

    // Load all active resources
    const allInstructors = await db
      .select()
      .from(instructors)
      .where(and(
        eq(instructors.operatorId, operatorId),
        eq(instructors.isActive, true),
      ));

    const allAircraft = await db
      .select()
      .from(aircraft)
      .where(and(
        eq(aircraft.operatorId, operatorId),
        eq(aircraft.isActive, true),
        eq(aircraft.isSimulator, false),
      ));

    // Calculate aircraft utilization
    const aircraftUtilization = allAircraft.map((craft) => {
      const craftReservations = dayReservations.filter((r) => r.aircraftId === craft.id);
      const hoursUsed = this.sumReservationHours(craftReservations);
      return {
        id: craft.id,
        registration: craft.registration,
        hoursUsed: Math.round(hoursUsed * 100) / 100,
        hoursAvailable: OPERATIONAL_HOURS_PER_DAY,
        pct: Math.round((hoursUsed / OPERATIONAL_HOURS_PER_DAY) * 100),
      };
    });

    // Calculate instructor utilization
    const instructorUtilization = allInstructors.map((inst) => {
      const instReservations = dayReservations.filter((r) => r.instructorId === inst.id);
      const hoursUsed = this.sumReservationHours(instReservations);
      return {
        id: inst.id,
        name: `${inst.firstName} ${inst.lastName}`,
        hoursUsed: Math.round(hoursUsed * 100) / 100,
        hoursAvailable: OPERATIONAL_HOURS_PER_DAY,
        pct: Math.round((hoursUsed / OPERATIONAL_HOURS_PER_DAY) * 100),
      };
    });

    // Calculate total gap minutes (time between reservations across all aircraft)
    const totalGapMinutes = this.calculateGapMinutes(dayReservations, dayStart);

    // Generate optimization suggestions
    const optimizationSuggestions = this.generateOptimizationSuggestions(
      aircraftUtilization,
      instructorUtilization,
      dayReservations,
      allAircraft,
    );

    const duration = Date.now() - startMs;
    await this.recordSolverRun(operatorId, 'optimize', { date }, dayReservations.length, duration);

    return {
      date,
      aircraftUtilization,
      instructorUtilization,
      totalGapMinutes,
      optimizationSuggestions,
    };
  }

  /**
   * Create multiple reservations from approved suggestion IDs.
   *
   * Loads each suggestion, inserts into reservation_history with status='completed',
   * and returns the count of successes and failures.
   */
  async batchCreateReservations(
    operatorId: number,
    suggestionIds: string[],
  ): Promise<BatchCreateResult> {
    const startMs = Date.now();
    this.logger.log(
      `[batchCreateReservations] operator=${operatorId} count=${suggestionIds.length}`,
    );

    let created = 0;
    const failed: Array<{ id: string; error: string }> = [];

    for (const suggestionId of suggestionIds) {
      try {
        // Load the suggestion
        const [suggestion] = await db
          .select()
          .from(suggestions)
          .where(and(
            eq(suggestions.id, suggestionId),
            eq(suggestions.operatorId, operatorId),
          ))
          .limit(1);

        if (!suggestion) {
          failed.push({ id: suggestionId, error: 'Suggestion not found' });
          continue;
        }

        if (suggestion.status !== 'approved' && suggestion.status !== 'pending') {
          failed.push({
            id: suggestionId,
            error: `Suggestion has status '${suggestion.status}' — must be 'approved' or 'pending'`,
          });
          continue;
        }

        // Insert into reservation_history
        await db.insert(reservationHistory).values({
          operatorId,
          studentId: suggestion.studentId ?? '',
          instructorId: suggestion.instructorId,
          aircraftId: suggestion.aircraftId,
          activityTypeId: suggestion.activityTypeId,
          locationId: suggestion.locationId,
          startTime: suggestion.proposedStart,
          endTime: suggestion.proposedEnd,
          status: 'completed',
        });

        // Update suggestion status to 'approved' if it was pending
        if (suggestion.status === 'pending') {
          await db.update(suggestions).set({
            status: 'approved',
            approvedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(suggestions.id, suggestionId));
        }

        created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ id: suggestionId, error: message });
      }
    }

    const duration = Date.now() - startMs;
    await this.recordSolverRun(
      operatorId,
      'bulk_schedule',
      { suggestionIds },
      created,
      duration,
    );

    this.logger.log(
      `[batchCreateReservations] Created ${created}, failed ${failed.length} in ${duration}ms`,
    );

    return { created, failed };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Load all reservations for an operator within a date range.
   */
  private async loadReservations(
    operatorId: number,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ReservationConflict[]> {
    const rows = await db
      .select({
        startTime: reservationHistory.startTime,
        endTime: reservationHistory.endTime,
        instructorId: reservationHistory.instructorId,
        aircraftId: reservationHistory.aircraftId,
        studentId: reservationHistory.studentId,
      })
      .from(reservationHistory)
      .where(and(
        eq(reservationHistory.operatorId, operatorId),
        // Overlapping range: reservation starts before range end AND ends after range start
        lte(reservationHistory.startTime, rangeEnd),
        gte(reservationHistory.endTime, rangeStart),
        // Exclude cancelled reservations
        sql`${reservationHistory.status} != 'cancelled'`,
      ));

    return rows.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      instructorId: r.instructorId,
      aircraftId: r.aircraftId,
      studentId: r.studentId,
    })) as (ReservationConflict & { studentId: string })[];
  }

  /**
   * Get the student's most recent instructor for continuity scoring.
   */
  private async getStudentLastInstructor(
    operatorId: number,
    studentId: string,
  ): Promise<string | null> {
    const [lastReservation] = await db
      .select({ instructorId: reservationHistory.instructorId })
      .from(reservationHistory)
      .where(and(
        eq(reservationHistory.operatorId, operatorId),
        eq(reservationHistory.studentId, studentId),
        eq(reservationHistory.status, 'completed'),
      ))
      .orderBy(sql`${reservationHistory.endTime} DESC`)
      .limit(1);

    return lastReservation?.instructorId ?? null;
  }

  /**
   * Sort instructors with preferred first, then last instructor, then rest.
   */
  private prioritizeInstructors(
    allInstructors: InstructorRecord[],
    preferredId?: string,
    lastInstructorId?: string | null,
  ): InstructorRecord[] {
    const preferred: InstructorRecord[] = [];
    const last: InstructorRecord[] = [];
    const rest: InstructorRecord[] = [];

    for (const inst of allInstructors) {
      if (preferredId && inst.id === preferredId) {
        preferred.push(inst);
      } else if (lastInstructorId && inst.id === lastInstructorId) {
        last.push(inst);
      } else {
        rest.push(inst);
      }
    }

    return [...preferred, ...last, ...rest];
  }

  /**
   * Sort aircraft with preferred first, then rest.
   */
  private prioritizeAircraft(
    allAircraft: AircraftRecord[],
    preferredId?: string,
  ): AircraftRecord[] {
    if (!preferredId) return allAircraft;
    const preferred = allAircraft.filter((a) => a.id === preferredId);
    const rest = allAircraft.filter((a) => a.id !== preferredId);
    return [...preferred, ...rest];
  }

  /**
   * Generate candidate time slots for a single day.
   *
   * When availability is provided, generates slots only within the instructor's
   * availability windows for that day-of-week, respecting date overrides.
   * Falls back to default 7am-6pm windows when no availability is given.
   */
  private generateDayCandidates(
    date: Date,
    durationMinutes: number,
    availability?: FspAvailability,
  ): Array<{ start: Date; end: Date }> {
    const candidates: Array<{ start: Date; end: Date }> = [];
    const now = new Date();

    if (availability) {
      const dayOfWeek = date.getDay(); // 0=Sunday
      // Use local date string (not toISOString which converts to UTC and can shift dates)
      const y = date.getFullYear();
      const m2 = String(date.getMonth() + 1).padStart(2, '0');
      const d2 = String(date.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m2}-${d2}`;

      // Check for date overrides (unavailable = skip entire day)
      const override = availability.availabilityOverrides?.find(
        (o: FspAvailabilityOverride) => o.date?.startsWith(dateStr),
      );

      if (override) {
        if (override.isUnavailable) {
          return []; // Instructor unavailable this day
        }

        // Use override times
        const overrideStart = this.parseTimeToMinutes(override.startTime);
        const overrideEnd = this.parseTimeToMinutes(override.endTime);

        for (let m = overrideStart; m + durationMinutes <= overrideEnd; m += SLOT_INTERVAL_MINUTES) {
          const start = new Date(date);
          start.setHours(Math.floor(m / 60), m % 60, 0, 0);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + durationMinutes);
          if (start > now) candidates.push({ start, end });
        }
        return candidates;
      }

      // Use recurring availability for this day of week
      const entries = availability.availabilities?.filter(
        (a: FspAvailabilityEntry) => a.dayOfWeek === dayOfWeek,
      ) ?? [];

      if (entries.length === 0) {
        return []; // Instructor doesn't work this day
      }

      for (const entry of entries) {
        const entryStart = this.parseTimeToMinutes(entry.startAtTimeUtc);
        const entryEnd = this.parseTimeToMinutes(entry.endAtTimeUtc);

        for (let m = entryStart; m + durationMinutes <= entryEnd; m += SLOT_INTERVAL_MINUTES) {
          const start = new Date(date);
          start.setHours(Math.floor(m / 60), m % 60, 0, 0);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + durationMinutes);
          if (start > now) candidates.push({ start, end });
        }
      }

      return candidates;
    }

    // Fallback: default 7am-6pm window (backward compat when no token/availability)
    const dayStartMinutes = DAY_START_HOUR * 60;
    const dayEndMinutes = DAY_END_HOUR * 60;

    for (let m = dayStartMinutes; m + durationMinutes <= dayEndMinutes; m += SLOT_INTERVAL_MINUTES) {
      const start = new Date(date);
      start.setHours(Math.floor(m / 60), m % 60, 0, 0);

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMinutes);

      // Skip slots in the past
      if (start <= now) continue;

      candidates.push({ start, end });
    }

    return candidates;
  }

  /**
   * Parse a time string like "08:00:00" or "2024-01-01T08:00:00" to minutes from midnight.
   */
  private parseTimeToMinutes(timeStr: string): number {
    const timePart = timeStr.includes('T') ? timeStr.split('T')[1]! : timeStr;
    const parts = timePart.split(':');
    const hours = parseInt(parts[0]!, 10);
    const minutes = parseInt(parts[1] ?? '0', 10);
    return hours * 60 + minutes;
  }

  /**
   * Check daylight constraint — slot must be within civil twilight boundaries.
   * Uses hardcoded sunrise 6:30am / sunset 6:00pm as specified.
   */
  private isDaylight(start: Date, end: Date): boolean {
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const sunriseMinutes = SUNRISE_HOUR * 60 + SUNRISE_MINUTE;
    const sunsetMinutes = SUNSET_HOUR * 60 + SUNSET_MINUTE;

    return startMinutes >= sunriseMinutes && endMinutes <= sunsetMinutes;
  }

  /**
   * Check if a resource (instructor or aircraft) has a conflicting reservation.
   */
  private hasResourceConflict(
    slotStart: Date,
    slotEnd: Date,
    resourceId: string,
    resourceType: 'instructor' | 'aircraft',
    existingReservations: ReservationConflict[],
  ): boolean {
    for (const res of existingReservations) {
      // Check time overlap
      if (slotStart < res.endTime && slotEnd > res.startTime) {
        const resResourceId = resourceType === 'instructor' ? res.instructorId : res.aircraftId;
        if (resResourceId === resourceId) return true;
      }
    }
    return false;
  }

  /**
   * Check if the student has a conflicting reservation.
   */
  private hasStudentConflict(
    slotStart: Date,
    slotEnd: Date,
    studentId: string,
    existingReservations: ReservationConflict[],
  ): boolean {
    for (const res of existingReservations) {
      if (slotStart < res.endTime && slotEnd > res.startTime) {
        if ((res as unknown as { studentId: string }).studentId === studentId) return true;
      }
    }
    return false;
  }

  /**
   * Score a slot based on preferences.
   *
   * Scoring breakdown:
   * - Base: 50 points
   * - Instructor continuity (same as student's recent instructor): +30
   * - Aircraft match (preferred aircraft): +10
   * - Preferred time (morning 8-10am gets a small bonus): +10
   */
  private scoreSlot(
    instructorId: string,
    aircraftId: string,
    slotStart: Date,
    preferredInstructorId?: string,
    preferredAircraftId?: string,
    lastInstructorId?: string | null,
  ): number {
    let score = 50;

    // Instructor continuity: +30 if matches preferred OR last instructor
    if (preferredInstructorId && instructorId === preferredInstructorId) {
      score += 30;
    } else if (lastInstructorId && instructorId === lastInstructorId) {
      score += 30;
    }

    // Aircraft match: +10 if preferred aircraft
    if (preferredAircraftId && aircraftId === preferredAircraftId) {
      score += 10;
    }

    // Preferred time: +10 for popular training hours (8am-10am)
    const hour = slotStart.getHours();
    if (hour >= 8 && hour <= 10) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Sum total hours of a set of reservations.
   */
  private sumReservationHours(
    reservations: ReservationConflict[],
  ): number {
    let totalMs = 0;
    for (const res of reservations) {
      totalMs += res.endTime.getTime() - res.startTime.getTime();
    }
    return totalMs / (1000 * 60 * 60);
  }

  /**
   * Calculate total gap minutes across all reservations in a day.
   * A "gap" is time between consecutive reservations on the same aircraft.
   */
  private calculateGapMinutes(
    reservations: ReservationConflict[],
    dayStart: Date,
  ): number {
    if (reservations.length === 0) return 0;

    // Group by aircraft
    const byAircraft = new Map<string, ReservationConflict[]>();
    for (const res of reservations) {
      if (!res.aircraftId) continue;
      const list = byAircraft.get(res.aircraftId) ?? [];
      list.push(res);
      byAircraft.set(res.aircraftId, list);
    }

    let totalGapMinutes = 0;

    for (const [, acReservations] of byAircraft) {
      // Sort by start time
      const sorted = [...acReservations].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );

      for (let i = 0; i < sorted.length - 1; i++) {
        const gapMs = sorted[i + 1]!.startTime.getTime() - sorted[i]!.endTime.getTime();
        if (gapMs > 0) {
          totalGapMinutes += gapMs / (1000 * 60);
        }
      }
    }

    return Math.round(totalGapMinutes);
  }

  /**
   * Generate actionable optimization suggestions based on utilization data.
   */
  private generateOptimizationSuggestions(
    aircraftUtil: OptimizeDayResult['aircraftUtilization'],
    instructorUtil: OptimizeDayResult['instructorUtilization'],
    reservations: ReservationConflict[],
    allAircraft: AircraftRecord[],
  ): string[] {
    const suggestions: string[] = [];

    // Identify underutilized aircraft
    const underutilizedAircraft = aircraftUtil.filter((a) => a.pct < 25);
    if (underutilizedAircraft.length > 0) {
      const names = underutilizedAircraft.map((a) => a.registration).join(', ');
      suggestions.push(
        `Aircraft ${names} ${underutilizedAircraft.length === 1 ? 'is' : 'are'} below 25% utilization — consider scheduling additional flights or offering rental slots.`,
      );
    }

    // Identify overloaded instructors
    const overloadedInstructors = instructorUtil.filter((i) => i.pct > 75);
    if (overloadedInstructors.length > 0) {
      const names = overloadedInstructors.map((i) => i.name).join(', ');
      suggestions.push(
        `${names} ${overloadedInstructors.length === 1 ? 'is' : 'are'} above 75% utilization — consider redistributing flights to lighter-loaded instructors.`,
      );
    }

    // Identify idle instructors
    const idleInstructors = instructorUtil.filter((i) => i.pct === 0);
    if (idleInstructors.length > 0) {
      const names = idleInstructors.map((i) => i.name).join(', ');
      suggestions.push(
        `${names} ${idleInstructors.length === 1 ? 'has' : 'have'} no scheduled flights — reassign from overbooked instructors if possible.`,
      );
    }

    // Check for large gaps
    if (reservations.length === 0) {
      suggestions.push(
        'No reservations scheduled for this day — prime opportunity to fill the schedule with waitlisted students.',
      );
    }

    // Check overall utilization
    const avgAircraftUtil = aircraftUtil.length > 0
      ? aircraftUtil.reduce((sum, a) => sum + a.pct, 0) / aircraftUtil.length
      : 0;
    if (avgAircraftUtil > 0 && avgAircraftUtil < 40) {
      suggestions.push(
        `Average aircraft utilization is only ${Math.round(avgAircraftUtil)}% — there is capacity for ${Math.round((100 - avgAircraftUtil) / 100 * allAircraft.length * OPERATIONAL_HOURS_PER_DAY / 2)} additional 2-hour flights.`,
      );
    }

    return suggestions;
  }

  /**
   * Record a solver run in the audit trail.
   */
  private async recordSolverRun(
    operatorId: number,
    runType: string,
    inputParams: unknown,
    resultCount: number,
    duration: number,
  ): Promise<void> {
    try {
      await db.insert(solverRuns).values({
        operatorId,
        runType,
        inputParams,
        resultCount,
        duration,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record solver run: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
