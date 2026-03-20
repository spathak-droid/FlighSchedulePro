import { describe, it, expect } from 'vitest';
import {
  hashSchedule,
  detectOpenings,
} from '../../../../src/core/scheduling/change-detector.js';
import type { ScheduleOpening } from '../../../../src/core/scheduling/change-detector.js';
import type { FspScheduleEvent } from '../../../../src/api/fsp/fsp.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<FspScheduleEvent> = {}): FspScheduleEvent {
  return {
    Start: '2024-03-15T10:00:00',
    End: '2024-03-15T12:00:00',
    Title: 'Dual Instruction',
    CustomerName: 'John Doe',
    InstructorName: 'Jane Smith',
    AircraftName: 'N12345',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hashSchedule
// ---------------------------------------------------------------------------

describe('hashSchedule', () => {
  it('returns a 64-character hex string', () => {
    const hash = hashSchedule([makeEvent()]);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same events', () => {
    const events = [makeEvent(), makeEvent({ CustomerName: 'Alice', Start: '2024-03-15T14:00:00' })];
    const hash1 = hashSchedule(events);
    const hash2 = hashSchedule([...events]);
    expect(hash1).toBe(hash2);
  });

  it('returns the same hash regardless of event order', () => {
    const e1 = makeEvent({ Start: '2024-03-15T08:00:00', Title: 'A' });
    const e2 = makeEvent({ Start: '2024-03-15T10:00:00', Title: 'B' });
    const e3 = makeEvent({ Start: '2024-03-15T12:00:00', Title: 'C' });

    const hash1 = hashSchedule([e1, e2, e3]);
    const hash2 = hashSchedule([e3, e1, e2]);

    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different events', () => {
    const hash1 = hashSchedule([makeEvent({ CustomerName: 'Alice' })]);
    const hash2 = hashSchedule([makeEvent({ CustomerName: 'Bob' })]);
    expect(hash1).not.toBe(hash2);
  });

  it('returns a deterministic hash for empty array', () => {
    const hash1 = hashSchedule([]);
    const hash2 = hashSchedule([]);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('produces different hashes when Start or End changes', () => {
    const base = makeEvent();
    const hBase = hashSchedule([base]);
    const hDiffStart = hashSchedule([makeEvent({ Start: '2024-03-15T11:00:00' })]);
    const hDiffEnd = hashSchedule([makeEvent({ End: '2024-03-15T13:00:00' })]);

    expect(hBase).not.toBe(hDiffStart);
    expect(hBase).not.toBe(hDiffEnd);
    expect(hDiffStart).not.toBe(hDiffEnd);
  });

  it('sorts by Start, then End, then Title for deterministic ordering', () => {
    // Events with same Start but different End
    const e1 = makeEvent({ Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00', Title: 'A' });
    const e2 = makeEvent({ Start: '2024-03-15T10:00:00', End: '2024-03-15T12:00:00', Title: 'A' });

    const hash1 = hashSchedule([e1, e2]);
    const hash2 = hashSchedule([e2, e1]);
    expect(hash1).toBe(hash2);

    // Events with same Start and End but different Title
    const e3 = makeEvent({ Start: '2024-03-15T10:00:00', End: '2024-03-15T12:00:00', Title: 'A' });
    const e4 = makeEvent({ Start: '2024-03-15T10:00:00', End: '2024-03-15T12:00:00', Title: 'B' });

    const hash3 = hashSchedule([e3, e4]);
    const hash4 = hashSchedule([e4, e3]);
    expect(hash3).toBe(hash4);
  });
});

// ---------------------------------------------------------------------------
// detectOpenings
// ---------------------------------------------------------------------------

describe('detectOpenings', () => {
  it('returns empty array when both snapshots are empty', () => {
    const result = detectOpenings([], [], 'loc-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when snapshots are identical', () => {
    const events = [makeEvent()];
    const result = detectOpenings(events, [...events], 'loc-1');
    expect(result).toEqual([]);
  });

  // ── Cancellation detection ──────────────────────────────────────────

  it('detects a cancellation opening when an event is removed', () => {
    const previous = [
      makeEvent({ CustomerName: 'Alice', Start: '2024-03-15T08:00:00', End: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T10:00:00', End: '2024-03-15T12:00:00' }),
    ];
    const current = [
      makeEvent({ CustomerName: 'Alice', Start: '2024-03-15T08:00:00', End: '2024-03-15T10:00:00' }),
    ];

    const result = detectOpenings(previous, current, 'loc-1');

    const cancellations = result.filter((o) => o.type === 'cancellation');
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0]!.previousReservation?.studentId).toBe('Bob');
    expect(cancellations[0]!.previousReservation?.activityTypeId).toBe('Dual Instruction');
    expect(cancellations[0]!.locationId).toBe('loc-1');
  });

  it('detects multiple cancellation openings', () => {
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T09:00:00', End: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];
    const current: FspScheduleEvent[] = [];

    const result = detectOpenings(previous, current, 'loc-1');
    const cancellations = result.filter((o) => o.type === 'cancellation');
    expect(cancellations).toHaveLength(3);
  });

  // ── Gap detection ─────────────────────────────────────────────────────

  it('detects a new gap when middle event is removed', () => {
    // Previous: events at 8-9, 9-10, 10-11 (no gaps)
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T09:00:00', End: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];
    // Current: events at 8-9, 10-11 (gap at 9-10)
    const current = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];

    const result = detectOpenings(previous, current, 'loc-1');
    const gaps = result.filter((o) => o.type === 'gap');

    // There should be a gap from 09:00 to 10:00 (60 min >= 30 min threshold)
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.start.getHours()).toBe(9);
    expect(gaps[0]!.end.getHours()).toBe(10);
  });

  it('does not report gaps shorter than 30 minutes', () => {
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T08:30:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T08:30:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T09:00:00', End: '2024-03-15T09:30:00' }),
    ];
    // Remove B, creating a 30-minute gap (8:30 - 9:00) which IS 30 minutes (threshold)
    // And also a gap exists from removing B as a cancellation
    const current = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T08:20:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T08:40:00', End: '2024-03-15T09:00:00' }),
    ];

    const result = detectOpenings(previous, current, 'loc-1');
    const gaps = result.filter((o) => o.type === 'gap');

    // Gap from 08:20 to 08:40 = 20 minutes, should be filtered out
    expect(gaps.every((g) => {
      const durationMin = (g.end.getTime() - g.start.getTime()) / 60_000;
      return durationMin >= 30;
    })).toBe(true);
  });

  it('does not report gaps that already existed in previous schedule', () => {
    // Previous: events at 8-9 and 10-11 (gap at 9-10 already existed)
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];
    // Same schedule in current
    const current = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];

    const result = detectOpenings(previous, current, 'loc-1');
    const gaps = result.filter((o) => o.type === 'gap');
    expect(gaps).toHaveLength(0);
  });

  // ── Opening metadata ──────────────────────────────────────────────────

  it('includes locationId in all openings', () => {
    const previous = [makeEvent()];
    const result = detectOpenings(previous, [], 'my-loc');

    for (const opening of result) {
      expect(opening.locationId).toBe('my-loc');
    }
  });

  it('uses default empty locationId if not provided', () => {
    const previous = [makeEvent()];
    const result = detectOpenings(previous, []);

    for (const opening of result) {
      expect(opening.locationId).toBe('');
    }
  });

  it('cancellation openings include previousReservation details', () => {
    const previous = [
      makeEvent({ CustomerName: 'Alice', Title: 'Solo Practice' }),
    ];

    const result = detectOpenings(previous, [], 'loc-1');
    const cancellation = result.find((o) => o.type === 'cancellation');

    expect(cancellation).toBeDefined();
    expect(cancellation!.previousReservation).toBeDefined();
    expect(cancellation!.previousReservation!.studentId).toBe('Alice');
    expect(cancellation!.previousReservation!.activityTypeId).toBe('Solo Practice');
  });

  it('gap openings do not include previousReservation', () => {
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T09:00:00', End: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];
    const current = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T09:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T10:00:00', End: '2024-03-15T11:00:00' }),
    ];

    const result = detectOpenings(previous, current, 'loc-1');
    const gaps = result.filter((o) => o.type === 'gap');

    for (const gap of gaps) {
      expect(gap.previousReservation).toBeUndefined();
    }
  });

  // ── Edge case: all events removed ────────────────────────────────────

  it('handles all events being removed (all cancellations)', () => {
    const previous = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00' }),
      makeEvent({ CustomerName: 'B', Start: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'C', Start: '2024-03-15T12:00:00' }),
    ];

    const result = detectOpenings(previous, [], 'loc-1');

    expect(result.filter((o) => o.type === 'cancellation')).toHaveLength(3);
  });

  // ── Edge case: no previous, events added ──────────────────────────────

  it('returns no openings when previous is empty and current has events', () => {
    const current = [
      makeEvent({ CustomerName: 'A', Start: '2024-03-15T08:00:00', End: '2024-03-15T10:00:00' }),
    ];

    const result = detectOpenings([], current, 'loc-1');

    // No cancellations (nothing was removed) and no new gaps (no previous for comparison)
    expect(result.filter((o) => o.type === 'cancellation')).toHaveLength(0);
  });

  // ── Date parsing ──────────────────────────────────────────────────────

  it('parses FSP datetime strings into valid Date objects', () => {
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-06-20T09:30:00',
        End: '2024-06-20T11:30:00',
      }),
    ];

    const result = detectOpenings(previous, [], 'loc-1');
    const opening = result[0]!;

    expect(opening.start).toBeInstanceOf(Date);
    expect(opening.end).toBeInstanceOf(Date);
    expect(opening.start.getFullYear()).toBe(2024);
    expect(opening.start.getMonth()).toBe(5); // June = 5
  });
});
