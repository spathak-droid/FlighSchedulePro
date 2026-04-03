/**
 * SYSTEM POLICIES — Fixed regulatory and safety constraints.
 *
 * These CANNOT be overridden by operators. They represent FAA regulations,
 * aviation safety best practices, and non-negotiable operational rules.
 *
 * Layer 1: REGULATORY (FAA / legal requirements)
 * Layer 2: SAFETY (industry best practices, non-negotiable)
 */

// ─── Layer 1: Regulatory (FAA) ──────────────────────────────────────────────

/**
 * Maximum instructor flight duty time per day (hours).
 * FAA Advisory Circular AC 61-65 recommends max 8 hours of flight instruction.
 */
export const MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY = 8

/**
 * Maximum student flight time per day (hours).
 * FAR 61.89(a) — student pilots must not fly to the point of fatigue.
 * 6 hours is the industry-standard conservative limit.
 */
export const MAX_STUDENT_FLIGHT_HOURS_PER_DAY = 6

/**
 * Maximum number of flights per student per day.
 * Prevents fatigue regardless of individual flight duration.
 */
export const MAX_STUDENT_FLIGHTS_PER_DAY = 3

/**
 * Maximum number of flights per instructor per day.
 * Even if under duty-time limit, mental fatigue degrades instruction quality.
 */
export const MAX_INSTRUCTOR_FLIGHTS_PER_DAY = 8

/**
 * Earliest civil twilight boundary for VFR student operations (minutes from midnight).
 * FAR 91.155 — VFR flight requires adequate visibility.
 * Student solo flights restricted to daylight hours.
 * 6:00 AM = 360 minutes (conservative — actual civil twilight varies by season/location).
 */
export const EARLIEST_FLIGHT_START_MINUTES = 360

/**
 * Latest civil twilight boundary for VFR student operations (minutes from midnight).
 * 6:30 PM = 1110 minutes (conservative for most US latitudes).
 */
export const LATEST_FLIGHT_END_MINUTES = 1110

// ─── Layer 2: Safety (Non-negotiable Operational) ───────────────────────────

/**
 * Minimum turnaround time between reservations on the same aircraft (minutes).
 * Allows for: taxi, shutdown, preflight inspection, fueling, passenger swap.
 */
export const MIN_AIRCRAFT_TURNAROUND_MINUTES = 30

/**
 * Minimum rest period between flights for the same student (minutes).
 * Prevents scheduling back-to-back flights without debrief time.
 */
export const MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES = 30

/**
 * Minimum rest period between flights for the same instructor (minutes).
 * Allows for debrief, paperwork, bathroom break, prep for next student.
 */
export const MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES = 15

/**
 * Minimum booking notice — don't schedule flights less than this many
 * hours in advance. Ensures student/instructor have time to prepare.
 */
export const MIN_BOOKING_NOTICE_HOURS = 2

/**
 * Maximum single flight duration in minutes.
 * Safety cap — no training flight should exceed 4 hours.
 */
export const MAX_SINGLE_FLIGHT_DURATION_MINUTES = 240

/**
 * Minimum single flight duration in minutes.
 * Anything under 30 min is not a real training event.
 */
export const MIN_SINGLE_FLIGHT_DURATION_MINUTES = 30

// ─── Policy Summary (for display / audit) ───────────────────────────────────

export interface SystemPolicyDefinition {
  id: string
  layer: 'regulatory' | 'safety'
  name: string
  description: string
  value: number
  unit: string
}

export const SYSTEM_POLICIES: SystemPolicyDefinition[] = [
  {
    id: 'instructor_duty_limit',
    layer: 'regulatory',
    name: 'Instructor Duty Time Limit',
    description: 'Maximum flight instruction hours per instructor per day (FAA AC 61-65)',
    value: MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY,
    unit: 'hours/day',
  },
  {
    id: 'student_daily_flight_hours',
    layer: 'regulatory',
    name: 'Student Daily Flight Hours',
    description: 'Maximum flight hours per student per day (FAR 61.89)',
    value: MAX_STUDENT_FLIGHT_HOURS_PER_DAY,
    unit: 'hours/day',
  },
  {
    id: 'student_daily_flight_count',
    layer: 'regulatory',
    name: 'Student Daily Flight Count',
    description: 'Maximum number of flights per student per day',
    value: MAX_STUDENT_FLIGHTS_PER_DAY,
    unit: 'flights/day',
  },
  {
    id: 'instructor_daily_flight_count',
    layer: 'regulatory',
    name: 'Instructor Daily Flight Count',
    description: 'Maximum number of flights per instructor per day',
    value: MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
    unit: 'flights/day',
  },
  {
    id: 'earliest_flight_start',
    layer: 'regulatory',
    name: 'Earliest Flight Start',
    description: 'Earliest allowed start time for VFR student flights',
    value: EARLIEST_FLIGHT_START_MINUTES,
    unit: 'minutes from midnight (6:00 AM)',
  },
  {
    id: 'latest_flight_end',
    layer: 'regulatory',
    name: 'Latest Flight End',
    description: 'Latest allowed end time for VFR student flights',
    value: LATEST_FLIGHT_END_MINUTES,
    unit: 'minutes from midnight (6:30 PM)',
  },
  {
    id: 'aircraft_turnaround',
    layer: 'safety',
    name: 'Aircraft Turnaround Time',
    description: 'Minimum gap between reservations on the same aircraft',
    value: MIN_AIRCRAFT_TURNAROUND_MINUTES,
    unit: 'minutes',
  },
  {
    id: 'student_rest_between_flights',
    layer: 'safety',
    name: 'Student Rest Between Flights',
    description: 'Minimum rest period between flights for the same student',
    value: MIN_STUDENT_REST_BETWEEN_FLIGHTS_MINUTES,
    unit: 'minutes',
  },
  {
    id: 'instructor_rest_between_flights',
    layer: 'safety',
    name: 'Instructor Rest Between Flights',
    description: 'Minimum rest period between flights for the same instructor',
    value: MIN_INSTRUCTOR_REST_BETWEEN_FLIGHTS_MINUTES,
    unit: 'minutes',
  },
  {
    id: 'min_booking_notice',
    layer: 'safety',
    name: 'Minimum Booking Notice',
    description: 'Minimum hours in advance a flight can be scheduled',
    value: MIN_BOOKING_NOTICE_HOURS,
    unit: 'hours',
  },
  {
    id: 'max_flight_duration',
    layer: 'safety',
    name: 'Maximum Flight Duration',
    description: 'Maximum duration of a single training flight',
    value: MAX_SINGLE_FLIGHT_DURATION_MINUTES,
    unit: 'minutes',
  },
  {
    id: 'min_flight_duration',
    layer: 'safety',
    name: 'Minimum Flight Duration',
    description: 'Minimum duration of a single training flight',
    value: MIN_SINGLE_FLIGHT_DURATION_MINUTES,
    unit: 'minutes',
  },
]
