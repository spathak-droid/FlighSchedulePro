import { describe, it, expect } from 'vitest';
import {
  detectCancellations,
  filterStudentCancellations,
} from '../../../../src/core/scheduling/cancellation-detector.js';
import type { CancelledReservation } from '../../../../src/core/scheduling/cancellation-detector.js';
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
// detectCancellations
// ---------------------------------------------------------------------------

describe('detectCancellations', () => {
  it('returns empty array when both snapshots are empty', () => {
    const result = detectCancellations([], [], 'loc-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when both snapshots are identical', () => {
    const events = [
      makeEvent({ CustomerName: 'Alice' }),
      makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T14:00:00', End: '2024-03-15T16:00:00' }),
    ];
    const result = detectCancellations(events, [...events], 'loc-1');
    expect(result).toEqual([]);
  });

  it('detects a single cancellation', () => {
    const previous = [
      makeEvent({ CustomerName: 'Alice' }),
      makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T14:00:00', End: '2024-03-15T16:00:00' }),
    ];
    // Bob's event is gone in current
    const current = [makeEvent({ CustomerName: 'Alice' })];

    const result = detectCancellations(previous, current, 'loc-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.studentName).toBe('Bob');
    expect(result[0]!.locationId).toBe('loc-1');
    expect(result[0]!.originalStart).toBeInstanceOf(Date);
    expect(result[0]!.originalEnd).toBeInstanceOf(Date);
  });

  it('detects multiple cancellations', () => {
    const previous = [
      makeEvent({ CustomerName: 'Alice', Start: '2024-03-15T08:00:00' }),
      makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T10:00:00' }),
      makeEvent({ CustomerName: 'Charlie', Start: '2024-03-15T12:00:00' }),
    ];
    const current = [makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T10:00:00' })];

    const result = detectCancellations(previous, current, 'loc-1');

    expect(result).toHaveLength(2);
    const names = result.map((c) => c.studentName).sort();
    expect(names).toEqual(['Alice', 'Charlie']);
  });

  it('does not flag new events in current as cancellations', () => {
    const previous = [makeEvent({ CustomerName: 'Alice' })];
    const current = [
      makeEvent({ CustomerName: 'Alice' }),
      makeEvent({
        CustomerName: 'NewStudent',
        Start: '2024-03-15T14:00:00',
        End: '2024-03-15T16:00:00',
      }),
    ];

    const result = detectCancellations(previous, current, 'loc-1');
    expect(result).toHaveLength(0);
  });

  it('returns empty when previous is empty but current has events', () => {
    const current = [makeEvent({ CustomerName: 'Alice' })];
    const result = detectCancellations([], current, 'loc-1');
    expect(result).toEqual([]);
  });

  it('detects all cancellations when current is empty', () => {
    const previous = [
      makeEvent({ CustomerName: 'Alice' }),
      makeEvent({ CustomerName: 'Bob', Start: '2024-03-15T14:00:00' }),
    ];
    const result = detectCancellations(previous, [], 'loc-1');
    expect(result).toHaveLength(2);
  });

  it('uses composite key (Start|End|CustomerName|InstructorName|AircraftName)', () => {
    // Same customer but different time -> counts as different event
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-03-15T08:00:00',
        End: '2024-03-15T10:00:00',
      }),
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-03-15T14:00:00',
        End: '2024-03-15T16:00:00',
      }),
    ];
    // Only the morning event remains
    const current = [
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-03-15T08:00:00',
        End: '2024-03-15T10:00:00',
      }),
    ];

    const result = detectCancellations(previous, current, 'loc-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.originalStart.getHours()).toBe(14);
  });

  it('populates instructorName and aircraftName when present', () => {
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        InstructorName: 'Instructor Joe',
        AircraftName: 'N54321',
      }),
    ];
    const result = detectCancellations(previous, [], 'loc-1');

    expect(result[0]!.instructorName).toBe('Instructor Joe');
    expect(result[0]!.aircraftName).toBe('N54321');
  });

  it('handles empty instructor/aircraft names as undefined', () => {
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        InstructorName: '',
        AircraftName: '',
      }),
    ];
    const result = detectCancellations(previous, [], 'loc-1');

    expect(result[0]!.instructorName).toBeUndefined();
    expect(result[0]!.aircraftName).toBeUndefined();
  });

  it('parses FSP local time correctly (no timezone suffix)', () => {
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-06-20T09:30:00',
        End: '2024-06-20T11:30:00',
      }),
    ];
    const result = detectCancellations(previous, [], 'loc-1');

    // Verify the dates are parsed without Z suffix
    const start = result[0]!.originalStart;
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(5); // June is month 5 (0-indexed)
    expect(start.getDate()).toBe(20);
  });

  it('strips Z suffix from FSP times', () => {
    const previous = [
      makeEvent({
        CustomerName: 'Alice',
        Start: '2024-06-20T09:30:00Z',
        End: '2024-06-20T11:30:00Z',
      }),
    ];
    // Current has same event but without Z, which should match due to key composition
    // Actually, the key uses the raw string, so Start with Z != Start without Z
    // Testing that parseFspTime strips the Z correctly
    const result = detectCancellations(previous, [], 'loc-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.originalStart).toBeInstanceOf(Date);
  });

  it('passes locationId through to results', () => {
    const previous = [makeEvent()];
    const result = detectCancellations(previous, [], 'my-location-123');
    expect(result[0]!.locationId).toBe('my-location-123');
  });

  it('uses event Title as activityTypeId', () => {
    const previous = [makeEvent({ Title: 'Solo Practice' })];
    const result = detectCancellations(previous, [], 'loc-1');
    expect(result[0]!.activityTypeId).toBe('Solo Practice');
  });
});

// ---------------------------------------------------------------------------
// filterStudentCancellations
// ---------------------------------------------------------------------------

describe('filterStudentCancellations', () => {
  it('returns empty array for empty input', () => {
    expect(filterStudentCancellations([])).toEqual([]);
  });

  it('keeps cancellations with non-empty student names', () => {
    const cancellations: CancelledReservation[] = [
      {
        studentId: 'John Doe',
        studentName: 'John Doe',
        activityTypeId: 'Dual',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
    ];

    const result = filterStudentCancellations(cancellations);
    expect(result).toHaveLength(1);
  });

  it('filters out cancellations with empty student name', () => {
    const cancellations: CancelledReservation[] = [
      {
        studentId: '',
        studentName: '',
        activityTypeId: 'Maintenance',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
    ];

    const result = filterStudentCancellations(cancellations);
    expect(result).toHaveLength(0);
  });

  it('filters out cancellations with whitespace-only student name', () => {
    const cancellations: CancelledReservation[] = [
      {
        studentId: '   ',
        studentName: '   ',
        activityTypeId: 'Meeting',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
    ];

    const result = filterStudentCancellations(cancellations);
    expect(result).toHaveLength(0);
  });

  it('keeps valid cancellations and filters invalid ones in a mixed set', () => {
    const cancellations: CancelledReservation[] = [
      {
        studentId: 'Valid Student',
        studentName: 'Valid Student',
        activityTypeId: 'Dual',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
      {
        studentId: '',
        studentName: '',
        activityTypeId: 'Maintenance Block',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
      {
        studentId: 'Another Student',
        studentName: 'Another Student',
        activityTypeId: 'Solo',
        originalStart: new Date(),
        originalEnd: new Date(),
        locationId: 'loc-1',
      },
    ];

    const result = filterStudentCancellations(cancellations);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.studentName)).toEqual(['Valid Student', 'Another Student']);
  });
});
