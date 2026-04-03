/**
 * 4-Layer Constraint Evaluator for Flight Scheduling.
 *
 * Layer 1: REGULATORY (FAA) — Fixed, never override. Violations = illegal.
 * Layer 2: SAFETY — Fixed, never override. Violations = dangerous.
 * Layer 3: OPERATOR RULES — Configurable per operator, always enforced.
 * Layer 4: PREFERENCES — Configurable, used for ranking not rejection.
 *
 * Layers 1-3 are hard constraints: if ANY fails, the slot is rejected.
 * Layer 4 produces a score: higher = better match to preferences.
 */

import type { FspAvailability, FspCivilTwilight } from '../../api/fsp/fsp.types.js';
import { getLocalParts } from '../utils/time.js';
import {
  MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY,
  MAX_STUDENT_FLIGHT_HOURS_PER_DAY,
  MAX_STUDENT_FLIGHTS_PER_DAY,
  MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
  EARLIEST_FLIGHT_START_MINUTES,
  LATEST_FLIGHT_END_MINUTES,
  MIN_AIRCRAFT_TURNAROUND_MINUTES,
  MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES,
  MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES,
  MIN_BOOKING_NOTICE_HOURS,
  MAX_SINGLE_FLIGHT_DURATION_MINUTES,
  MIN_SINGLE_FLIGHT_DURATION_MINUTES,
} from './system-policies.js';

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
  /** Which layer this constraint belongs to. */
  layer: 'regulatory' | 'safety' | 'operator' | 'preference';
  /** Whether this is a hard constraint (rejection) vs soft (scoring). */
  hard: boolean;
}

/** Existing reservation data used for conflict/duty-time checks. */
export interface ExistingReservation {
  startTime: Date;
  endTime: Date;
  instructorId: string | null;
  aircraftId: string | null;
  studentId: string | null;
}

/** Operator-configurable policy settings (from scheduling_policies table). */
export interface OperatorPolicy {
  lessonBufferMinutes: number;
  minBookingNoticeHours: number;
  maxInstructorFlightsPerDay: number;
  maxStudentFlightsPerDay: number;
  maxInstructorDutyHours: number;
  requireInstructorTypeMatch: boolean;
  instructorContinuityWeight: number;
  preferredTimeBlock: string;
}

/** Default operator policy values — used when operator hasn't configured custom values. */
export const DEFAULT_OPERATOR_POLICY: OperatorPolicy = {
  lessonBufferMinutes: 15,
  minBookingNoticeHours: 24,
  maxInstructorFlightsPerDay: 6,
  maxStudentFlightsPerDay: 3,
  maxInstructorDutyHours: 8,
  requireInstructorTypeMatch: true,
  instructorContinuityWeight: 30,
  preferredTimeBlock: 'all_day',
};

/** Full evaluation result with layered details. */
export interface EvaluationResult {
  /** Whether ALL hard constraints (layers 1-3) passed. */
  feasible: boolean;
  /** Preference score from layer 4 (0-100). Only meaningful when feasible. */
  preferenceScore: number;
  /** All individual constraint results, ordered by layer. */
  constraints: ConstraintResult[];
  /** Summary of which layers passed/failed. */
  layerSummary: {
    regulatory: boolean;
    safety: boolean;
    operator: boolean;
    preferenceScore: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTimeToMinutes(time: string): number {
  const timePart = time.includes('T') ? time.split('T')[1]! : time;
  const parts = timePart.split(':');
  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  return hours * 60 + minutes;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] ?? `Day${dayOfWeek}`;
}

function getDurationMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}

function isSameDay(a: Date, b: Date, timezone: string): boolean {
  const pa = getLocalParts(a, timezone);
  const pb = getLocalParts(b, timezone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Get reservations for a specific resource on the same day as the proposed slot. */
function getResourceReservationsOnDay(
  resourceId: string,
  resourceField: 'instructorId' | 'aircraftId' | 'studentId',
  proposedStart: Date,
  existingReservations: ExistingReservation[],
  timezone: string,
): ExistingReservation[] {
  return existingReservations.filter((r) => {
    const fieldValue =
      resourceField === 'instructorId'
        ? r.instructorId
        : resourceField === 'aircraftId'
          ? r.aircraftId
          : r.studentId;
    return fieldValue === resourceId && isSameDay(r.startTime, proposedStart, timezone);
  });
}

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

  const proposedDateStr = proposedStart.toISOString().split('T')[0]!;

  for (const override of userAvail.availabilityOverrides) {
    if (override.date === proposedDateStr) {
      if (override.isUnavailable) {
        return {
          available: false,
          reason: `User ${userId} has an unavailability override on ${proposedDateStr}`,
        };
      }

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

  const dayOfWeek = proposedStart.getDay();
  const matchingEntries = userAvail.availabilities.filter((entry) => entry.dayOfWeek === dayOfWeek);

  if (matchingEntries.length === 0) {
    return {
      available: false,
      reason: `User ${userId} has no availability on day ${dayOfWeek} (${getDayName(dayOfWeek)})`,
    };
  }

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

// ─── Layer 1: Regulatory Constraints (FAA / Fixed) ──────────────────────────

function evaluateRegulatoryConstraints(
  constraints: SchedulingConstraints,
  existingReservations: ExistingReservation[],
  timezone: string,
): ConstraintResult[] {
  const results: ConstraintResult[] = [];
  const proposedDuration = getDurationMinutes(constraints.proposedStart, constraints.proposedEnd);

  // 1a. Flight duration within legal bounds
  if (proposedDuration > MAX_SINGLE_FLIGHT_DURATION_MINUTES) {
    results.push({
      passed: false,
      constraint: 'max_flight_duration',
      details: `Flight duration ${proposedDuration}min exceeds maximum ${MAX_SINGLE_FLIGHT_DURATION_MINUTES}min`,
      layer: 'regulatory',
      hard: true,
    });
  } else if (proposedDuration < MIN_SINGLE_FLIGHT_DURATION_MINUTES) {
    results.push({
      passed: false,
      constraint: 'min_flight_duration',
      details: `Flight duration ${proposedDuration}min is below minimum ${MIN_SINGLE_FLIGHT_DURATION_MINUTES}min`,
      layer: 'regulatory',
      hard: true,
    });
  } else {
    results.push({
      passed: true,
      constraint: 'flight_duration',
      details: `Flight duration ${proposedDuration}min is within bounds (${MIN_SINGLE_FLIGHT_DURATION_MINUTES}-${MAX_SINGLE_FLIGHT_DURATION_MINUTES}min)`,
      layer: 'regulatory',
      hard: true,
    });
  }

  // 1b. Daylight hours (VFR student operations)
  const startParts = getLocalParts(constraints.proposedStart, timezone);
  const endParts = getLocalParts(constraints.proposedEnd, timezone);
  const propStartMin = startParts.hour * 60 + startParts.minute;
  const propEndMin = endParts.hour * 60 + endParts.minute;

  const withinDaylight =
    propStartMin >= EARLIEST_FLIGHT_START_MINUTES && propEndMin <= LATEST_FLIGHT_END_MINUTES;

  results.push({
    passed: withinDaylight,
    constraint: 'daylight_hours',
    details: withinDaylight
      ? `Flight time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} is within daylight hours`
      : `Flight time ${formatMinutes(propStartMin)}-${formatMinutes(propEndMin)} outside daylight hours (${formatMinutes(EARLIEST_FLIGHT_START_MINUTES)}-${formatMinutes(LATEST_FLIGHT_END_MINUTES)})`,
    layer: 'regulatory',
    hard: true,
  });

  // 1c. Instructor duty time limit
  if (constraints.instructorId) {
    const instructorDayReservations = getResourceReservationsOnDay(
      constraints.instructorId,
      'instructorId',
      constraints.proposedStart,
      existingReservations,
      timezone,
    );

    const existingDutyMinutes = instructorDayReservations.reduce(
      (sum, r) => sum + getDurationMinutes(r.startTime, r.endTime),
      0,
    );
    const totalDutyMinutes = existingDutyMinutes + proposedDuration;
    const maxDutyMinutes = MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY * 60;

    results.push({
      passed: totalDutyMinutes <= maxDutyMinutes,
      constraint: 'instructor_duty_time',
      details:
        totalDutyMinutes <= maxDutyMinutes
          ? `Instructor duty time ${Math.round(totalDutyMinutes)}min (${Math.round(totalDutyMinutes / 60 * 10) / 10}h) within ${MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY}h limit`
          : `Instructor duty time would be ${Math.round(totalDutyMinutes)}min (${Math.round(totalDutyMinutes / 60 * 10) / 10}h), exceeds FAA ${MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY}h limit`,
      layer: 'regulatory',
      hard: true,
    });

    // 1d. Instructor daily flight count (system max)
    const instructorFlightCount = instructorDayReservations.length + 1;
    results.push({
      passed: instructorFlightCount <= MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
      constraint: 'instructor_flight_count_regulatory',
      details:
        instructorFlightCount <= MAX_INSTRUCTOR_FLIGHTS_PER_DAY
          ? `Instructor flight count ${instructorFlightCount} within system max ${MAX_INSTRUCTOR_FLIGHTS_PER_DAY}`
          : `Instructor would have ${instructorFlightCount} flights, exceeds system max ${MAX_INSTRUCTOR_FLIGHTS_PER_DAY}`,
      layer: 'regulatory',
      hard: true,
    });
  }

  // 1e. Student daily flight hours limit
  const studentDayReservations = getResourceReservationsOnDay(
    constraints.studentId,
    'studentId',
    constraints.proposedStart,
    existingReservations,
    timezone,
  );

  const existingStudentMinutes = studentDayReservations.reduce(
    (sum, r) => sum + getDurationMinutes(r.startTime, r.endTime),
    0,
  );
  const totalStudentMinutes = existingStudentMinutes + proposedDuration;
  const maxStudentMinutes = MAX_STUDENT_FLIGHT_HOURS_PER_DAY * 60;

  results.push({
    passed: totalStudentMinutes <= maxStudentMinutes,
    constraint: 'student_daily_hours',
    details:
      totalStudentMinutes <= maxStudentMinutes
        ? `Student flight time ${Math.round(totalStudentMinutes)}min (${Math.round(totalStudentMinutes / 60 * 10) / 10}h) within ${MAX_STUDENT_FLIGHT_HOURS_PER_DAY}h limit`
        : `Student flight time would be ${Math.round(totalStudentMinutes)}min (${Math.round(totalStudentMinutes / 60 * 10) / 10}h), exceeds ${MAX_STUDENT_FLIGHT_HOURS_PER_DAY}h limit`,
    layer: 'regulatory',
    hard: true,
  });

  // 1f. Student daily flight count (system max)
  const studentFlightCount = studentDayReservations.length + 1;
  results.push({
    passed: studentFlightCount <= MAX_STUDENT_FLIGHTS_PER_DAY,
    constraint: 'student_flight_count_regulatory',
    details:
      studentFlightCount <= MAX_STUDENT_FLIGHTS_PER_DAY
        ? `Student flight count ${studentFlightCount} within system max ${MAX_STUDENT_FLIGHTS_PER_DAY}`
        : `Student would have ${studentFlightCount} flights, exceeds system max ${MAX_STUDENT_FLIGHTS_PER_DAY}`,
    layer: 'regulatory',
    hard: true,
  });

  return results;
}

// ─── Layer 2: Safety Constraints (Fixed) ────────────────────────────────────

function evaluateSafetyConstraints(
  constraints: SchedulingConstraints,
  existingReservations: ExistingReservation[],
  timezone: string,
): ConstraintResult[] {
  const results: ConstraintResult[] = [];
  const now = new Date();

  // 2a. Minimum booking notice
  const hoursUntilFlight =
    (constraints.proposedStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  results.push({
    passed: hoursUntilFlight >= MIN_BOOKING_NOTICE_HOURS,
    constraint: 'booking_notice',
    details:
      hoursUntilFlight >= MIN_BOOKING_NOTICE_HOURS
        ? `Flight is ${Math.round(hoursUntilFlight)}h away, meets ${MIN_BOOKING_NOTICE_HOURS}h minimum notice`
        : `Flight is only ${Math.round(hoursUntilFlight * 10) / 10}h away, requires at least ${MIN_BOOKING_NOTICE_HOURS}h notice`,
    layer: 'safety',
    hard: true,
  });

  // 2b. Aircraft turnaround time
  if (constraints.aircraftId) {
    const aircraftDayReservations = getResourceReservationsOnDay(
      constraints.aircraftId,
      'aircraftId',
      constraints.proposedStart,
      existingReservations,
      timezone,
    );

    let turnaroundOk = true;
    let turnaroundDetails = '';

    for (const res of aircraftDayReservations) {
      // Check gap between this reservation's end and proposed start
      const gapAfterExisting =
        (constraints.proposedStart.getTime() - res.endTime.getTime()) / 60_000;
      // Check gap between proposed end and this reservation's start
      const gapBeforeExisting =
        (res.startTime.getTime() - constraints.proposedEnd.getTime()) / 60_000;

      // If proposed slot is after existing reservation
      if (gapAfterExisting >= 0 && gapAfterExisting < MIN_AIRCRAFT_TURNAROUND_MINUTES) {
        turnaroundOk = false;
        turnaroundDetails = `Only ${Math.round(gapAfterExisting)}min gap after previous reservation, need ${MIN_AIRCRAFT_TURNAROUND_MINUTES}min turnaround`;
        break;
      }

      // If proposed slot is before existing reservation
      if (gapBeforeExisting >= 0 && gapBeforeExisting < MIN_AIRCRAFT_TURNAROUND_MINUTES) {
        turnaroundOk = false;
        turnaroundDetails = `Only ${Math.round(gapBeforeExisting)}min gap before next reservation, need ${MIN_AIRCRAFT_TURNAROUND_MINUTES}min turnaround`;
        break;
      }

      // Check for actual time overlap (conflict)
      if (constraints.proposedStart < res.endTime && constraints.proposedEnd > res.startTime) {
        turnaroundOk = false;
        turnaroundDetails = 'Aircraft has a conflicting reservation at this time';
        break;
      }
    }

    results.push({
      passed: turnaroundOk,
      constraint: 'aircraft_turnaround',
      details: turnaroundOk
        ? `Aircraft has sufficient turnaround time (${MIN_AIRCRAFT_TURNAROUND_MINUTES}min minimum)`
        : turnaroundDetails,
      layer: 'safety',
      hard: true,
    });
  }

  // 2c. Student rest between flights
  const studentDayReservations = getResourceReservationsOnDay(
    constraints.studentId,
    'studentId',
    constraints.proposedStart,
    existingReservations,
    timezone,
  );

  let studentRestOk = true;
  let studentRestDetails = '';

  for (const res of studentDayReservations) {
    const gapAfter = (constraints.proposedStart.getTime() - res.endTime.getTime()) / 60_000;
    const gapBefore = (res.startTime.getTime() - constraints.proposedEnd.getTime()) / 60_000;

    if (gapAfter >= 0 && gapAfter < MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES) {
      studentRestOk = false;
      studentRestDetails = `Only ${Math.round(gapAfter)}min rest after previous flight, need ${MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES}min`;
      break;
    }

    if (gapBefore >= 0 && gapBefore < MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES) {
      studentRestOk = false;
      studentRestDetails = `Only ${Math.round(gapBefore)}min rest before next flight, need ${MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES}min`;
      break;
    }

    // Overlap
    if (constraints.proposedStart < res.endTime && constraints.proposedEnd > res.startTime) {
      studentRestOk = false;
      studentRestDetails = 'Student has a conflicting reservation at this time';
      break;
    }
  }

  results.push({
    passed: studentRestOk,
    constraint: 'student_rest',
    details: studentRestOk
      ? `Student has adequate rest between flights (${MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES}min minimum)`
      : studentRestDetails,
    layer: 'safety',
    hard: true,
  });

  // 2d. Instructor rest between flights
  if (constraints.instructorId) {
    const instructorDayReservations = getResourceReservationsOnDay(
      constraints.instructorId,
      'instructorId',
      constraints.proposedStart,
      existingReservations,
      timezone,
    );

    let instructorRestOk = true;
    let instructorRestDetails = '';

    for (const res of instructorDayReservations) {
      const gapAfter = (constraints.proposedStart.getTime() - res.endTime.getTime()) / 60_000;
      const gapBefore = (res.startTime.getTime() - constraints.proposedEnd.getTime()) / 60_000;

      if (gapAfter >= 0 && gapAfter < MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES) {
        instructorRestOk = false;
        instructorRestDetails = `Only ${Math.round(gapAfter)}min rest after previous flight, need ${MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES}min`;
        break;
      }

      if (gapBefore >= 0 && gapBefore < MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES) {
        instructorRestOk = false;
        instructorRestDetails = `Only ${Math.round(gapBefore)}min rest before next flight, need ${MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES}min`;
        break;
      }

      // Overlap
      if (constraints.proposedStart < res.endTime && constraints.proposedEnd > res.startTime) {
        instructorRestOk = false;
        instructorRestDetails = 'Instructor has a conflicting reservation at this time';
        break;
      }
    }

    results.push({
      passed: instructorRestOk,
      constraint: 'instructor_rest',
      details: instructorRestOk
        ? `Instructor has adequate rest between flights (${MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES}min minimum)`
        : instructorRestDetails,
      layer: 'safety',
      hard: true,
    });
  }

  return results;
}

// ─── Layer 3: Operator Rules (Configurable, Always Enforced) ────────────────

function evaluateOperatorConstraints(
  constraints: SchedulingConstraints,
  existingReservations: ExistingReservation[],
  availability: FspAvailability[],
  policy: OperatorPolicy,
  timezone: string,
): ConstraintResult[] {
  const results: ConstraintResult[] = [];

  // 3a. Operator's booking notice (may be stricter than system minimum)
  const now = new Date();
  const hoursUntilFlight =
    (constraints.proposedStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Operator notice must be >= system minimum
  const effectiveNotice = Math.max(policy.minBookingNoticeHours, MIN_BOOKING_NOTICE_HOURS);

  results.push({
    passed: hoursUntilFlight >= effectiveNotice,
    constraint: 'operator_booking_notice',
    details:
      hoursUntilFlight >= effectiveNotice
        ? `Flight is ${Math.round(hoursUntilFlight)}h away, meets operator's ${effectiveNotice}h notice policy`
        : `Flight is only ${Math.round(hoursUntilFlight * 10) / 10}h away, operator requires ${effectiveNotice}h notice`,
    layer: 'operator',
    hard: true,
  });

  // 3b. Operator's max instructor flights per day (must be <= system max)
  if (constraints.instructorId) {
    const instructorDayRes = getResourceReservationsOnDay(
      constraints.instructorId,
      'instructorId',
      constraints.proposedStart,
      existingReservations,
      timezone,
    );

    const operatorMax = Math.min(
      policy.maxInstructorFlightsPerDay,
      MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
    );
    const flightCount = instructorDayRes.length + 1;

    results.push({
      passed: flightCount <= operatorMax,
      constraint: 'operator_instructor_flight_limit',
      details:
        flightCount <= operatorMax
          ? `Instructor flight count ${flightCount} within operator limit of ${operatorMax}`
          : `Instructor would have ${flightCount} flights, exceeds operator limit of ${operatorMax}`,
      layer: 'operator',
      hard: true,
    });

    // 3c. Operator's instructor duty hours (must be <= system max)
    const operatorDutyMax = Math.min(
      policy.maxInstructorDutyHours,
      MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY,
    );
    const existingDutyMin = instructorDayRes.reduce(
      (sum, r) => sum + getDurationMinutes(r.startTime, r.endTime),
      0,
    );
    const totalDutyMin =
      existingDutyMin + getDurationMinutes(constraints.proposedStart, constraints.proposedEnd);

    results.push({
      passed: totalDutyMin <= operatorDutyMax * 60,
      constraint: 'operator_instructor_duty_hours',
      details:
        totalDutyMin <= operatorDutyMax * 60
          ? `Instructor duty ${Math.round(totalDutyMin / 60 * 10) / 10}h within operator's ${operatorDutyMax}h limit`
          : `Instructor duty would be ${Math.round(totalDutyMin / 60 * 10) / 10}h, exceeds operator's ${operatorDutyMax}h limit`,
      layer: 'operator',
      hard: true,
    });
  }

  // 3d. Operator's max student flights per day (must be <= system max)
  const studentDayRes = getResourceReservationsOnDay(
    constraints.studentId,
    'studentId',
    constraints.proposedStart,
    existingReservations,
    timezone,
  );

  const operatorStudentMax = Math.min(policy.maxStudentFlightsPerDay, MAX_STUDENT_FLIGHTS_PER_DAY);
  const studentFlightCount = studentDayRes.length + 1;

  results.push({
    passed: studentFlightCount <= operatorStudentMax,
    constraint: 'operator_student_flight_limit',
    details:
      studentFlightCount <= operatorStudentMax
        ? `Student flight count ${studentFlightCount} within operator limit of ${operatorStudentMax}`
        : `Student would have ${studentFlightCount} flights, exceeds operator limit of ${operatorStudentMax}`,
    layer: 'operator',
    hard: true,
  });

  // 3e. Lesson buffer (configurable padding between flights)
  if (constraints.aircraftId) {
    const aircraftDayRes = getResourceReservationsOnDay(
      constraints.aircraftId,
      'aircraftId',
      constraints.proposedStart,
      existingReservations,
      timezone,
    );

    // Effective buffer is max of operator's buffer and system turnaround
    const effectiveBuffer = Math.max(policy.lessonBufferMinutes, MIN_AIRCRAFT_TURNAROUND_MINUTES);
    let bufferOk = true;
    let bufferDetails = '';

    for (const res of aircraftDayRes) {
      const gapAfter = (constraints.proposedStart.getTime() - res.endTime.getTime()) / 60_000;
      const gapBefore = (res.startTime.getTime() - constraints.proposedEnd.getTime()) / 60_000;

      if (gapAfter >= 0 && gapAfter < effectiveBuffer) {
        bufferOk = false;
        bufferDetails = `Only ${Math.round(gapAfter)}min buffer after previous lesson, operator requires ${effectiveBuffer}min`;
        break;
      }

      if (gapBefore >= 0 && gapBefore < effectiveBuffer) {
        bufferOk = false;
        bufferDetails = `Only ${Math.round(gapBefore)}min buffer before next lesson, operator requires ${effectiveBuffer}min`;
        break;
      }
    }

    if (bufferOk) {
      results.push({
        passed: true,
        constraint: 'lesson_buffer',
        details: `Lesson buffer of ${effectiveBuffer}min is satisfied`,
        layer: 'operator',
        hard: true,
      });
    } else {
      results.push({
        passed: false,
        constraint: 'lesson_buffer',
        details: bufferDetails,
        layer: 'operator',
        hard: true,
      });
    }
  }

  // 3f. Student availability (from FSP)
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
      ? `Student is available at the proposed time`
      : studentCheck.reason,
    layer: 'operator',
    hard: true,
  });

  // 3g. Instructor availability (from FSP)
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
        ? `Instructor is available at the proposed time`
        : instructorCheck.reason,
      layer: 'operator',
      hard: true,
    });
  }

  // 3h. Activity type present
  const hasActivityType =
    !!constraints.activityTypeId && constraints.activityTypeId.trim().length > 0;

  results.push({
    passed: hasActivityType,
    constraint: 'activity_type',
    details: hasActivityType
      ? `Activity type ${constraints.activityTypeId} specified`
      : 'No activity type specified for the proposed booking',
    layer: 'operator',
    hard: true,
  });

  return results;
}

// ─── Layer 4: Preferences (Scoring, Not Rejection) ─────────────────────────

function evaluatePreferences(
  constraints: SchedulingConstraints,
  policy: OperatorPolicy,
  preferredInstructorId?: string,
  preferredAircraftId?: string,
  timezone = 'America/Los_Angeles',
): { score: number; results: ConstraintResult[] } {
  const results: ConstraintResult[] = [];
  let score = 50; // Base score

  // 4a. Instructor continuity
  if (preferredInstructorId && constraints.instructorId) {
    const isPreferred = constraints.instructorId === preferredInstructorId;
    const bonus = isPreferred ? policy.instructorContinuityWeight : 0;
    score += bonus;

    results.push({
      passed: true, // Preferences never reject — they just adjust score
      constraint: 'instructor_continuity',
      details: isPreferred
        ? `Same instructor as previous session (+${bonus} points)`
        : `Different instructor (-0 points, continuity weight: ${policy.instructorContinuityWeight})`,
      layer: 'preference',
      hard: false,
    });
  }

  // 4b. Aircraft preference
  if (preferredAircraftId && constraints.aircraftId) {
    const isPreferred = constraints.aircraftId === preferredAircraftId;
    if (isPreferred) score += 10;

    results.push({
      passed: true,
      constraint: 'aircraft_preference',
      details: isPreferred ? 'Preferred aircraft (+10 points)' : 'Different aircraft (+0 points)',
      layer: 'preference',
      hard: false,
    });
  }

  // 4c. Time block preference
  const startParts = getLocalParts(constraints.proposedStart, timezone);
  const startHour = startParts.hour;

  let timeBonus = 0;
  if (policy.preferredTimeBlock === 'morning' && startHour >= 7 && startHour <= 11) {
    timeBonus = 10;
  } else if (policy.preferredTimeBlock === 'afternoon' && startHour >= 12 && startHour <= 17) {
    timeBonus = 10;
  } else if (policy.preferredTimeBlock === 'all_day') {
    // Small bonus for popular training hours (8am-10am)
    if (startHour >= 8 && startHour <= 10) timeBonus = 5;
  }

  score += timeBonus;

  results.push({
    passed: true,
    constraint: 'time_preference',
    details:
      timeBonus > 0
        ? `Preferred time block match (+${timeBonus} points)`
        : `Outside preferred time block (+0 points)`,
    layer: 'preference',
    hard: false,
  });

  return { score: Math.min(score, 100), results };
}

// ─── Main Evaluator (Public API) ────────────────────────────────────────────

/**
 * Evaluate ALL scheduling constraints across all 4 layers.
 *
 * @param constraints         The proposed booking parameters.
 * @param existingReservations All reservations in the relevant time period for conflict checking.
 * @param availability        FSP availability records for relevant users.
 * @param policy              Operator-configurable policy (or defaults).
 * @param twilight            Optional civil twilight data.
 * @param preferredInstructorId  For preference scoring.
 * @param preferredAircraftId    For preference scoring.
 * @param timezone            Operator timezone (default: America/Los_Angeles).
 */
export function evaluateAllConstraints(
  constraints: SchedulingConstraints,
  existingReservations: ExistingReservation[],
  availability: FspAvailability[],
  policy: OperatorPolicy = DEFAULT_OPERATOR_POLICY,
  preferredInstructorId?: string,
  preferredAircraftId?: string,
  timezone = 'America/Los_Angeles',
): EvaluationResult {
  // Layer 1: Regulatory
  const regulatoryResults = evaluateRegulatoryConstraints(
    constraints,
    existingReservations,
    timezone,
  );

  // Layer 2: Safety
  const safetyResults = evaluateSafetyConstraints(constraints, existingReservations, timezone);

  // Layer 3: Operator rules
  const operatorResults = evaluateOperatorConstraints(
    constraints,
    existingReservations,
    availability,
    policy,
    timezone,
  );

  // Layer 4: Preferences (scoring)
  const { score: preferenceScore, results: preferenceResults } = evaluatePreferences(
    constraints,
    policy,
    preferredInstructorId,
    preferredAircraftId,
    timezone,
  );

  const allConstraints = [
    ...regulatoryResults,
    ...safetyResults,
    ...operatorResults,
    ...preferenceResults,
  ];

  const regulatoryPassed = regulatoryResults.every((r) => r.passed);
  const safetyPassed = safetyResults.every((r) => r.passed);
  const operatorPassed = operatorResults.every((r) => r.passed);
  const feasible = regulatoryPassed && safetyPassed && operatorPassed;

  return {
    feasible,
    preferenceScore,
    constraints: allConstraints,
    layerSummary: {
      regulatory: regulatoryPassed,
      safety: safetyPassed,
      operator: operatorPassed,
      preferenceScore,
    },
  };
}

// ─── Backward-Compatible API ────────────────────────────────────────────────

/**
 * Legacy API — evaluates constraints and returns flat ConstraintResult array.
 * Maintained for backward compatibility with existing callers.
 */
export function evaluateConstraints(
  constraints: SchedulingConstraints,
  availability: FspAvailability[],
  twilight?: FspCivilTwilight,
  timezone = 'America/Los_Angeles',
): ConstraintResult[] {
  // Use the full evaluator with default policy and empty reservations
  const result = evaluateAllConstraints(
    constraints,
    [], // No reservation data in legacy mode
    availability,
    DEFAULT_OPERATOR_POLICY,
    undefined,
    undefined,
    timezone,
  );

  // Add twilight check if provided (legacy behavior)
  if (twilight) {
    const dawnMinutes = parseTimeFromFspDateTime(twilight.startDate);
    const duskMinutes = parseTimeFromFspDateTime(twilight.endDate);
    const startParts = getLocalParts(constraints.proposedStart, timezone);
    const endParts = getLocalParts(constraints.proposedEnd, timezone);
    const propStartMin = startParts.hour * 60 + startParts.minute;
    const propEndMin = endParts.hour * 60 + endParts.minute;
    const withinDaylight = propStartMin >= dawnMinutes && propEndMin <= duskMinutes;

    result.constraints.push({
      passed: withinDaylight,
      constraint: 'civil_twilight',
      details: withinDaylight
        ? `Within civil twilight (${formatMinutes(dawnMinutes)}-${formatMinutes(duskMinutes)})`
        : `Outside civil twilight (${formatMinutes(dawnMinutes)}-${formatMinutes(duskMinutes)})`,
      layer: 'regulatory',
      hard: true,
    });
  }

  return result.constraints;
}

// ─── Daylight Constraint (T081) — Backward Compat ──────────────────────────

export interface DaylightConstraintResult {
  passed: boolean;
  reason: string;
  constraint: string;
}

function parseTimeFromFspDateTime(fspDateTime: string): number {
  const timePart = fspDateTime.split('T')[1];
  if (!timePart) return 0;
  return parseTimeToMinutes(timePart);
}

export function evaluateDaylightConstraint(
  proposedStart: Date,
  proposedEnd: Date,
  civilTwilight: FspCivilTwilight,
  timezone = 'America/Los_Angeles',
): DaylightConstraintResult {
  const dawnMinutes = parseTimeFromFspDateTime(civilTwilight.startDate);
  const duskMinutes = parseTimeFromFspDateTime(civilTwilight.endDate);

  const startParts = getLocalParts(proposedStart, timezone);
  const endParts = getLocalParts(proposedEnd, timezone);
  const propStartMin = startParts.hour * 60 + startParts.minute;
  const propEndMin = endParts.hour * 60 + endParts.minute;

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

export function filterDaylightSlots<T extends { start: Date; end: Date }>(
  slots: T[],
  civilTwilight: FspCivilTwilight,
  timezone = 'America/Los_Angeles',
): T[] {
  return slots.filter((slot) => {
    const result = evaluateDaylightConstraint(slot.start, slot.end, civilTwilight, timezone);
    return result.passed;
  });
}
