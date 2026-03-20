/**
 * T074: Cancellation detector.
 *
 * Compares two snapshots of FSP schedule events (previous vs current poll)
 * and identifies reservations that were cancelled between polls.
 *
 * A cancellation is detected when an event present in the previous snapshot
 * is absent from the current snapshot. Events are keyed by their composite
 * identity: Start + End + CustomerName + InstructorName + AircraftName.
 */

import type { FspScheduleEvent } from '../../api/fsp/fsp.types.js';

// ─── Public Interfaces ──────────────────────────────────────────────────────

export interface CancelledReservation {
  /** FSP student/customer ID extracted from event context. */
  studentId: string;
  /** Display name of the student. */
  studentName: string;
  /** FSP activity type ID (when available from event title). */
  activityTypeId: string;
  /** Original reservation start time (parsed from FSP local-time string). */
  originalStart: Date;
  /** Original reservation end time (parsed from FSP local-time string). */
  originalEnd: Date;
  /** Location ID associated with the schedule poll. */
  locationId: string;
  /** Instructor ID (when available). */
  instructorId?: string;
  /** Instructor display name. */
  instructorName?: string;
  /** Aircraft ID (when available). */
  aircraftId?: string;
  /** Aircraft registration/name. */
  aircraftName?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic composite key for an FSP schedule event so we can
 * do set-difference between snapshots.
 *
 * Key = `Start|End|CustomerName|InstructorName|AircraftName`
 */
function eventKey(event: FspScheduleEvent): string {
  return [
    event.Start,
    event.End,
    event.CustomerName,
    event.InstructorName,
    event.AircraftName,
  ].join('|');
}

/**
 * Parse an FSP local-time string ("2024-03-15T10:00:00") into a JS Date.
 * FSP times have no timezone suffix — we parse them as-is (local interpretation).
 */
function parseFspTime(fspTime: string): Date {
  // If it already has a Z or offset, strip it — FSP should be local time
  const cleaned = fspTime.replace(/Z$/, '').split('+')[0]!;
  return new Date(cleaned);
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Detect cancellations by comparing two schedule snapshots.
 *
 * Events present in `previousEvents` but absent in `currentEvents` are
 * considered cancelled.
 *
 * @param previousEvents  The schedule snapshot from the last poll.
 * @param currentEvents   The schedule snapshot from the current poll.
 * @param locationId      The location these events belong to (passed through to results).
 * @returns An array of cancelled reservations with extracted metadata.
 */
export function detectCancellations(
  previousEvents: FspScheduleEvent[],
  currentEvents: FspScheduleEvent[],
  locationId: string,
): CancelledReservation[] {
  // Build a set of composite keys from the current snapshot
  const currentKeys = new Set<string>(currentEvents.map(eventKey));

  const cancellations: CancelledReservation[] = [];

  for (const prev of previousEvents) {
    const key = eventKey(prev);

    if (!currentKeys.has(key)) {
      // This event existed before but is gone now — it was cancelled

      cancellations.push({
        // Names are passed through for DB-based ID resolution by the caller
        // (ResourceLookupService in generate-suggestions job).
        studentId: prev.CustomerName, // Resolved to real ID by caller via name lookup
        studentName: prev.CustomerName,
        activityTypeId: prev.Title || '', // Event title used for activity type resolution
        originalStart: parseFspTime(prev.Start),
        originalEnd: parseFspTime(prev.End),
        locationId,
        instructorId: undefined, // Resolved by caller via instructorName lookup
        instructorName: prev.InstructorName || undefined,
        aircraftId: undefined, // Resolved by caller via aircraftName lookup
        aircraftName: prev.AircraftName || undefined,
      });
    }
  }

  return cancellations;
}

/**
 * Filter cancellations to only include student reservations (not maintenance,
 * meetings, etc.). This is a heuristic: events where CustomerName is empty
 * or where the Title indicates a non-student event are excluded.
 */
export function filterStudentCancellations(
  cancellations: CancelledReservation[],
): CancelledReservation[] {
  return cancellations.filter((c) => {
    // Must have a customer name
    if (!c.studentName || c.studentName.trim() === '') return false;
    return true;
  });
}
