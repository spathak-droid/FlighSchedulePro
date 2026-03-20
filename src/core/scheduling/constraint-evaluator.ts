/**
 * Constraint evaluator for scheduling suggestions.
 *
 * Checks whether a proposed booking satisfies availability, daylight,
 * and activity-type constraints sourced from FSP data.
 */

import type { FspAvailability, FspCivilTwilight } from '../../api/fsp/fsp.types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SchedulingConstraints {
  studentId: string;
  proposedStart: Date;
  proposedEnd: Date;
  activityTypeId: string;
  locationId: string;
  instructorId?: string;
  aircraftId?: string;
}

export interface ConstraintResult {
  /** Whether the constraint passed. */
  passed: boolean;
  /** Machine-readable constraint identifier. */
  constraint: string;
  /** Human-readable explanation. */
  details: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if a user (student or instructor) is available at the proposed time
 * based on their FSP availability records (weekly schedule + overrides).
 *
 * Availability entries define the recurring weekly windows (dayOfWeek + start/end times).
 * Overrides can mark a specific date as unavailable or replace the normal window.
 */
function isUserAvailable(
  userId: string,
  proposedStart: Date,
  proposedEnd: Date,
  availabilities: FspAvailability[],
): { available: boolean; reason: string } {
  const userAvail = availabilities.find((a) => a.userGuidId === userId);

  if (!userAvail) {
    return {
      available: false,
      reason: `No availability data found for user ${userId}`,
    };
  }

  // Check overrides first — they take precedence over recurring schedule
  const proposedDateStr = proposedStart.toISOString().split('T')[0]!;

  for (const override of userAvail.availabilityOverrides) {
    if (override.date === proposedDateStr) {
      if (override.isUnavailable) {
        return {
          available: false,
          reason: `User ${userId} has an unavailability override on ${proposedDateStr}`,
        };
      }

      // Override provides a custom window for this date — check if proposed time fits
      const overrideStart = parseTimeToMinutes(override.startTime);
      const overrideEnd = parseTimeToMinutes(override.endTime);
      const propStartMin = proposedStart.getHours() * 60 + proposedStart.getMinutes();
      const propEndMin = proposedEnd.getHours() * 60 + proposedEnd.getMinutes();

      if (propStartMin >= overrideStart && propEndMin <= overrideEnd) {
        return { available: true, reason: 'Within availability override window' };
      }

      return {
        available: false,
        reason:
          `Proposed time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} ` +
          `outside override window ${formatMinutes(overrideStart)}-${formatMinutes(overrideEnd)} ` +
          `for user ${userId} on ${proposedDateStr}`,
      };
    }
  }

  // No override for this date — check recurring weekly schedule
  const dayOfWeek = proposedStart.getDay(); // 0=Sunday

  const matchingEntries = userAvail.availabilities.filter((entry) => entry.dayOfWeek === dayOfWeek);

  if (matchingEntries.length === 0) {
    return {
      available: false,
      reason: `User ${userId} has no availability on day ${dayOfWeek} (${getDayName(dayOfWeek)})`,
    };
  }

  // Check if the proposed time window falls within at least one availability entry
  const propStartMin = proposedStart.getHours() * 60 + proposedStart.getMinutes();
  const propEndMin = proposedEnd.getHours() * 60 + proposedEnd.getMinutes();

  for (const entry of matchingEntries) {
    const entryStart = parseTimeToMinutes(entry.startAtTimeUtc);
    const entryEnd = parseTimeToMinutes(entry.endAtTimeUtc);

    if (propStartMin >= entryStart && propEndMin <= entryEnd) {
      return { available: true, reason: 'Within recurring availability window' };
    }
  }

  return {
    available: false,
    reason:
      `Proposed time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} ` +
      `does not fit within any availability window for user ${userId} on ${getDayName(dayOfWeek)}`,
  };
}

/**
 * Parse a time string like "08:00" or "08:00:00" into minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(':');
  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight as "HH:MM".
 */
function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] ?? `Day${dayOfWeek}`;
}

// ─── Main Evaluator ──────────────────────────────────────────────────────────

/**
 * Evaluate all scheduling constraints for a proposed booking.
 *
 * Returns an array of individual constraint results — each with a passed/failed
 * flag and human-readable details. The caller should check that **all** results
 * have `passed === true` before proceeding.
 *
 * @param constraints  The proposed booking parameters.
 * @param availability FSP availability records for relevant users (students + instructors).
 * @param twilight     Optional civil twilight for the location on the proposed date.
 *                     When provided, enforces daylight-hours constraint.
 */
export function evaluateConstraints(
  constraints: SchedulingConstraints,
  availability: FspAvailability[],
  twilight?: FspCivilTwilight,
): ConstraintResult[] {
  const results: ConstraintResult[] = [];

  // ── Constraint 1: Student availability ─────────────────────────────────

  const studentCheck = isUserAvailable(
    constraints.studentId,
    constraints.proposedStart,
    constraints.proposedEnd,
    availability,
  );

  results.push({
    passed: studentCheck.available,
    constraint: 'student_availability',
    details: studentCheck.available
      ? `Student ${constraints.studentId} is available at the proposed time`
      : studentCheck.reason,
  });

  // ── Constraint 2: Instructor availability (if specified) ───────────────

  if (constraints.instructorId) {
    const instructorCheck = isUserAvailable(
      constraints.instructorId,
      constraints.proposedStart,
      constraints.proposedEnd,
      availability,
    );

    results.push({
      passed: instructorCheck.available,
      constraint: 'instructor_availability',
      details: instructorCheck.available
        ? `Instructor ${constraints.instructorId} is available at the proposed time`
        : instructorCheck.reason,
    });
  }

  // ── Constraint 3: Daylight hours (if twilight data provided) ───────────

  if (twilight) {
    // Parse twilight times. They are in FSP local time format (no TZ suffix).
    // We compare using the raw hour/minute components since both the twilight
    // and proposed times should be in the operator's local time context.
    const dawnMinutes = parseTimeFromFspDateTime(twilight.startDate);
    const duskMinutes = parseTimeFromFspDateTime(twilight.endDate);

    const propStartMin =
      constraints.proposedStart.getHours() * 60 + constraints.proposedStart.getMinutes();
    const propEndMin =
      constraints.proposedEnd.getHours() * 60 + constraints.proposedEnd.getMinutes();

    const withinDaylight = propStartMin >= dawnMinutes && propEndMin <= duskMinutes;

    results.push({
      passed: withinDaylight,
      constraint: 'daylight_hours',
      details: withinDaylight
        ? `Proposed time is within daylight hours (${formatMinutes(dawnMinutes)}-${formatMinutes(duskMinutes)})`
        : `Proposed time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} ` +
          `is outside daylight hours ${formatMinutes(dawnMinutes)}-${formatMinutes(duskMinutes)}`,
    });
  }

  // ── Constraint 4: Activity type present ────────────────────────────────

  const hasActivityType =
    !!constraints.activityTypeId && constraints.activityTypeId.trim().length > 0;

  results.push({
    passed: hasActivityType,
    constraint: 'activity_type',
    details: hasActivityType
      ? `Activity type ${constraints.activityTypeId} specified`
      : 'No activity type specified for the proposed booking',
  });

  return results;
}

/**
 * Extract minutes-since-midnight from an FSP datetime string like
 * "2024-03-15T06:30" or "2024-03-15T06:30:00".
 */
function parseTimeFromFspDateTime(fspDateTime: string): number {
  const timePart = fspDateTime.split('T')[1];
  if (!timePart) return 0;
  return parseTimeToMinutes(timePart);
}

// ─── Daylight Constraint (T081) ─────────────────────────────────────────────

export interface DaylightConstraintResult {
  /** Whether the constraint passed. */
  passed: boolean;
  /** Human-readable explanation. */
  reason: string;
  /** Constraint name for logging/audit. */
  constraint: string;
}

/**
 * Evaluate whether a proposed time window falls entirely within civil
 * twilight (daylight) boundaries.
 *
 * Used by the Discovery Flight booking flow to ensure prospect flights
 * are only scheduled during daylight hours.
 *
 * @param proposedStart  Start time of the proposed reservation.
 * @param proposedEnd    End time of the proposed reservation.
 * @param civilTwilight  Civil twilight data from FSP (startDate = dawn, endDate = dusk).
 * @returns A DaylightConstraintResult indicating pass/fail with reason.
 */
export function evaluateDaylightConstraint(
  proposedStart: Date,
  proposedEnd: Date,
  civilTwilight: FspCivilTwilight,
): DaylightConstraintResult {
  const dawnMinutes = parseTimeFromFspDateTime(civilTwilight.startDate);
  const duskMinutes = parseTimeFromFspDateTime(civilTwilight.endDate);

  const propStartMin = proposedStart.getHours() * 60 + proposedStart.getMinutes();
  const propEndMin = proposedEnd.getHours() * 60 + proposedEnd.getMinutes();

  if (propStartMin < dawnMinutes) {
    return {
      passed: false,
      reason: `Proposed start ${formatMinutes(propStartMin)} is before civil dawn at ${formatMinutes(dawnMinutes)}`,
      constraint: 'daylight',
    };
  }

  if (propEndMin > duskMinutes) {
    return {
      passed: false,
      reason: `Proposed end ${formatMinutes(propEndMin)} is after civil dusk at ${formatMinutes(duskMinutes)}`,
      constraint: 'daylight',
    };
  }

  return {
    passed: true,
    reason: `Proposed time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} is within daylight hours ${formatMinutes(dawnMinutes)}-${formatMinutes(duskMinutes)}`,
    constraint: 'daylight',
  };
}

/**
 * Filter an array of candidate slots to only those entirely within daylight hours.
 *
 * @param slots          Array of { start, end } time windows.
 * @param civilTwilight  Civil twilight for the day.
 * @returns Only slots that pass the daylight constraint.
 */
export function filterDaylightSlots<T extends { start: Date; end: Date }>(
  slots: T[],
  civilTwilight: FspCivilTwilight,
): T[] {
  return slots.filter((slot) => {
    const result = evaluateDaylightConstraint(slot.start, slot.end, civilTwilight);
    return result.passed;
  });
}
