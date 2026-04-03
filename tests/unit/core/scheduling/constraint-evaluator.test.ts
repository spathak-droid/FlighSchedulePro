import { describe, it, expect } from 'vitest';
import {
  evaluateConstraints,
  evaluateAllConstraints,
  evaluateDaylightConstraint,
  filterDaylightSlots,
  DEFAULT_OPERATOR_POLICY,
} from '../../../../src/core/scheduling/constraint-evaluator.js';
import type { FspAvailability, FspCivilTwilight } from '../../../../src/api/fsp/fsp.types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a date in UTC to avoid timezone ambiguity in tests. */
function makeDate(year: number, month: number, day: number, hour: number, min = 0): Date {
  return new Date(year, month - 1, day, hour, min);
}

/** Create a UTC date string and parse — ensures consistent behavior regardless of test runner TZ. */
function makeUTCDate(year: number, month: number, day: number, hour: number, min = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, min));
}

function makeAvailability(
  userId: string,
  entries: { dayOfWeek: number; start: string; end: string }[],
  overrides: { date: string; start: string; end: string; unavailable?: boolean }[] = [],
): FspAvailability {
  return {
    userGuidId: userId,
    availabilities: entries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      startAtTimeUtc: e.start,
      endAtTimeUtc: e.end,
    })),
    availabilityOverrides: overrides.map((o) => ({
      date: o.date,
      startTime: o.start,
      endTime: o.end,
      isUnavailable: o.unavailable ?? false,
    })),
  };
}

const TWILIGHT: FspCivilTwilight = {
  startDate: '2026-03-21T06:30',
  endDate: '2026-03-21T18:45',
};

// ─── evaluateConstraints (legacy API) ───────────────────────────────────────

describe('evaluateConstraints', () => {
  it('passes core constraints when everything is valid', () => {
    // Wednesday March 18 2026 = day 3
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
      makeAvailability('inst-1', [{ dayOfWeek: 3, start: '07:00', end: '18:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
        instructorId: 'inst-1',
      },
      availability,
      TWILIGHT,
    );

    // New 4-layer evaluator returns more constraints. Check key ones pass.
    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(true);

    const instructorResult = results.find((r) => r.constraint === 'instructor_availability');
    expect(instructorResult?.passed).toBe(true);

    const activityResult = results.find((r) => r.constraint === 'activity_type');
    expect(activityResult?.passed).toBe(true);
  });

  it('fails when student has no availability data', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const results = evaluateConstraints(
      {
        studentId: 'stu-missing',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      [],
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
    expect(studentResult?.details).toContain('No availability data found');
  });

  it('fails when student is outside their availability window', () => {
    // Wednesday = day 3
    const start = makeDate(2026, 3, 18, 18, 0); // 6pm
    const end = makeDate(2026, 3, 18, 19, 0); // 7pm

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
    expect(studentResult?.details).toContain('does not fit within any availability window');
  });

  it('fails when student has no availability on the proposed day of week', () => {
    // Wednesday = day 3, but availability is only on Monday (day 1)
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 1, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
    expect(studentResult?.details).toContain('no availability on day');
  });

  it('uses override when present for the date (unavailable)', () => {
    // Wednesday = day 3
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability(
        'stu-1',
        [{ dayOfWeek: 3, start: '08:00', end: '17:00' }],
        [{ date: '2026-03-18', start: '08:00', end: '17:00', unavailable: true }],
      ),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
    expect(studentResult?.details).toContain('unavailability override');
  });

  it('uses override custom window when present for the date', () => {
    const start = makeDate(2026, 3, 18, 14, 0); // 2pm
    const end = makeDate(2026, 3, 18, 15, 0); // 3pm

    const availability = [
      makeAvailability(
        'stu-1',
        [{ dayOfWeek: 3, start: '08:00', end: '17:00' }],
        // Override narrows the window to 9am-12pm
        [{ date: '2026-03-18', start: '09:00', end: '12:00', unavailable: false }],
      ),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
    expect(studentResult?.details).toContain('outside override window');
  });

  it('passes with override custom window when proposed time fits', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability(
        'stu-1',
        [{ dayOfWeek: 3, start: '08:00', end: '17:00' }],
        [{ date: '2026-03-18', start: '09:00', end: '12:00', unavailable: false }],
      ),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(true);
    expect(studentResult?.details).toContain('available');
  });

  it('fails when instructor is unavailable', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
      // instructor has no Wednesday availability
      makeAvailability('inst-1', [{ dayOfWeek: 1, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
        instructorId: 'inst-1',
      },
      availability,
    );

    const instResult = results.find((r) => r.constraint === 'instructor_availability');
    expect(instResult?.passed).toBe(false);
  });

  it('skips instructor constraint when no instructorId provided', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    expect(results.find((r) => r.constraint === 'instructor_availability')).toBeUndefined();
  });

  it('includes daylight_hours constraint from regulatory layer', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    // Daylight hours is now always checked in regulatory layer
    const daylightResult = results.find((r) => r.constraint === 'daylight_hours');
    expect(daylightResult).toBeDefined();
    expect(daylightResult?.layer).toBe('regulatory');
  });

  it('adds civil_twilight constraint when twilight data provided', () => {
    // Use UTC dates to avoid timezone shift issues
    const start = makeUTCDate(2026, 3, 21, 18, 0);
    const end = makeUTCDate(2026, 3, 21, 19, 30); // past 18:45 dusk

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 6, start: '04:00', end: '22:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
      TWILIGHT,
      'UTC', // Use UTC timezone for consistent test behavior
    );

    const civilTwilightResult = results.find((r) => r.constraint === 'civil_twilight');
    expect(civilTwilightResult).toBeDefined();
    expect(civilTwilightResult?.passed).toBe(false);
  });

  it('fails when activityTypeId is empty', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: '',
        locationId: 'loc-1',
      },
      availability,
    );

    const activityResult = results.find((r) => r.constraint === 'activity_type');
    expect(activityResult?.passed).toBe(false);
    expect(activityResult?.details).toContain('No activity type');
  });

  it('fails when activityTypeId is whitespace only', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: '   ',
        locationId: 'loc-1',
      },
      availability,
    );

    const activityResult = results.find((r) => r.constraint === 'activity_type');
    expect(activityResult?.passed).toBe(false);
  });

  it('passes activity type when valid ID provided', () => {
    const start = makeDate(2026, 3, 18, 10, 0);
    const end = makeDate(2026, 3, 18, 11, 0);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: 3, start: '08:00', end: '17:00' }]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'dual-instruction',
        locationId: 'loc-1',
      },
      availability,
    );

    const activityResult = results.find((r) => r.constraint === 'activity_type');
    expect(activityResult?.passed).toBe(true);
  });

  it('handles multiple availability windows on same day', () => {
    // Student has two windows: morning and afternoon
    const start = makeDate(2026, 3, 18, 14, 0); // 2pm
    const end = makeDate(2026, 3, 18, 15, 0); // 3pm

    const availability = [
      makeAvailability('stu-1', [
        { dayOfWeek: 3, start: '08:00', end: '12:00' },
        { dayOfWeek: 3, start: '13:00', end: '17:00' },
      ]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(true);
  });

  it('fails when time falls between two availability windows', () => {
    const start = makeDate(2026, 3, 18, 12, 0); // noon - in the gap
    const end = makeDate(2026, 3, 18, 13, 30);

    const availability = [
      makeAvailability('stu-1', [
        { dayOfWeek: 3, start: '08:00', end: '12:00' },
        { dayOfWeek: 3, start: '14:00', end: '17:00' },
      ]),
    ];

    const results = evaluateConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      availability,
    );

    const studentResult = results.find((r) => r.constraint === 'student_availability');
    expect(studentResult?.passed).toBe(false);
  });
});

// ─── evaluateAllConstraints (new 4-layer API) ──────────────────────────────

describe('evaluateAllConstraints', () => {
  // Use dates far in the future to avoid booking notice failures
  function futureDate(daysFromNow: number, hour: number, minute = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  // Get day of week for a future date
  function futureDayOfWeek(daysFromNow: number): number {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.getDay();
  }

  it('marks feasible when all hard constraints pass', () => {
    const start = futureDate(7, 10, 0);
    const end = futureDate(7, 11, 0);
    const dow = futureDayOfWeek(7);

    const availability = [
      makeAvailability('stu-1', [{ dayOfWeek: dow, start: '08:00', end: '17:00' }]),
      makeAvailability('inst-1', [{ dayOfWeek: dow, start: '07:00', end: '18:00' }]),
    ];

    const result = evaluateAllConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
        instructorId: 'inst-1',
      },
      [],
      availability,
      DEFAULT_OPERATOR_POLICY,
    );

    expect(result.feasible).toBe(true);
    expect(result.layerSummary.regulatory).toBe(true);
    expect(result.layerSummary.safety).toBe(true);
    expect(result.layerSummary.operator).toBe(true);
    expect(result.preferenceScore).toBeGreaterThan(0);
  });

  it('returns constraint results with layer annotations', () => {
    const start = futureDate(7, 10, 0);
    const end = futureDate(7, 11, 0);

    const result = evaluateAllConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      [],
      [],
      DEFAULT_OPERATOR_POLICY,
    );

    // Every constraint should have layer and hard properties
    for (const c of result.constraints) {
      expect(c.layer).toBeDefined();
      expect(c.hard).toBeDefined();
      expect(['regulatory', 'safety', 'operator', 'preference']).toContain(c.layer);
    }
  });

  it('rejects when flight duration exceeds maximum', () => {
    const start = futureDate(7, 8, 0);
    const end = futureDate(7, 13, 0); // 5 hours — exceeds 4h max

    const result = evaluateAllConstraints(
      {
        studentId: 'stu-1',
        proposedStart: start,
        proposedEnd: end,
        activityTypeId: 'at-001',
        locationId: 'loc-1',
      },
      [],
      [],
      DEFAULT_OPERATOR_POLICY,
    );

    expect(result.feasible).toBe(false);
    expect(result.layerSummary.regulatory).toBe(false);
    const durationResult = result.constraints.find((c) => c.constraint === 'max_flight_duration');
    expect(durationResult?.passed).toBe(false);
  });
});

// ─── evaluateDaylightConstraint ─────────────────────────────────────────────

describe('evaluateDaylightConstraint', () => {
  // Use UTC timezone to avoid machine-specific offsets in tests
  const TZ = 'UTC';

  it('passes when within daylight', () => {
    const result = evaluateDaylightConstraint(
      makeUTCDate(2026, 3, 21, 10, 0),
      makeUTCDate(2026, 3, 21, 11, 0),
      TWILIGHT,
      TZ,
    );
    expect(result.passed).toBe(true);
    expect(result.constraint).toBe('daylight');
  });

  it('fails when start is before dawn', () => {
    const result = evaluateDaylightConstraint(
      makeUTCDate(2026, 3, 21, 5, 0),
      makeUTCDate(2026, 3, 21, 7, 0),
      TWILIGHT,
      TZ,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('before civil dawn');
  });

  it('fails when end is after dusk', () => {
    const result = evaluateDaylightConstraint(
      makeUTCDate(2026, 3, 21, 17, 0),
      makeUTCDate(2026, 3, 21, 19, 30),
      TWILIGHT,
      TZ,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('after civil dusk');
  });

  it('passes at exact dawn boundary', () => {
    const result = evaluateDaylightConstraint(
      makeUTCDate(2026, 3, 21, 6, 30), // exactly at dawn
      makeUTCDate(2026, 3, 21, 8, 0),
      TWILIGHT,
      TZ,
    );
    expect(result.passed).toBe(true);
  });

  it('passes at exact dusk boundary', () => {
    const result = evaluateDaylightConstraint(
      makeUTCDate(2026, 3, 21, 17, 0),
      makeUTCDate(2026, 3, 21, 18, 45), // exactly at dusk
      TWILIGHT,
      TZ,
    );
    expect(result.passed).toBe(true);
  });
});

// ─── filterDaylightSlots ────────────────────────────────────────────────────

describe('filterDaylightSlots', () => {
  const TZ = 'UTC';

  it('filters out slots outside daylight', () => {
    const slots = [
      { start: makeUTCDate(2026, 3, 21, 5, 0), end: makeUTCDate(2026, 3, 21, 6, 0), id: 'early' },
      { start: makeUTCDate(2026, 3, 21, 10, 0), end: makeUTCDate(2026, 3, 21, 11, 0), id: 'ok' },
      { start: makeUTCDate(2026, 3, 21, 19, 0), end: makeUTCDate(2026, 3, 21, 20, 0), id: 'late' },
    ];

    const filtered = filterDaylightSlots(slots, TWILIGHT, TZ);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('ok');
  });

  it('returns empty array when all slots are outside daylight', () => {
    const slots = [
      { start: makeUTCDate(2026, 3, 21, 4, 0), end: makeUTCDate(2026, 3, 21, 5, 0) },
      { start: makeUTCDate(2026, 3, 21, 20, 0), end: makeUTCDate(2026, 3, 21, 21, 0) },
    ];

    const filtered = filterDaylightSlots(slots, TWILIGHT, TZ);
    expect(filtered).toHaveLength(0);
  });

  it('returns all slots when all are within daylight', () => {
    const slots = [
      { start: makeUTCDate(2026, 3, 21, 8, 0), end: makeUTCDate(2026, 3, 21, 9, 0) },
      { start: makeUTCDate(2026, 3, 21, 12, 0), end: makeUTCDate(2026, 3, 21, 13, 0) },
    ];

    const filtered = filterDaylightSlots(slots, TWILIGHT, TZ);
    expect(filtered).toHaveLength(2);
  });

  it('handles empty input', () => {
    const filtered = filterDaylightSlots([], TWILIGHT, TZ);
    expect(filtered).toHaveLength(0);
  });
});
