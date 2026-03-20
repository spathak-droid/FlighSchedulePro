/**
 * Schedule change detector.
 *
 * Hashes schedule snapshots for efficient comparison and detects new openings
 * (cancellations and gaps) by diffing two schedule states.
 */

import { createHash } from 'crypto';
import type { FspScheduleEvent } from '../../api/fsp/fsp.types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ScheduleOpening {
  /** Start of the opening (local time, same context as FSP events). */
  start: Date;
  /** End of the opening. */
  end: Date;
  /** FSP location ID where the opening exists. */
  locationId: string;
  /** If this opening is a cancellation, details about the removed reservation. */
  previousReservation?: {
    studentId: string;
    activityTypeId: string;
  };
  /** Whether this opening is from a cancellation or a newly detected gap. */
  type: 'cancellation' | 'gap';
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Create a deterministic SHA-256 hash of a schedule events array.
 *
 * Events are sorted by Start time to ensure stable ordering regardless of
 * the order FSP returns them. The hash captures Start, End, Title,
 * CustomerName, InstructorName, and AircraftName for each event.
 *
 * @param events  Array of FSP schedule events.
 * @returns  64-character hex SHA-256 digest.
 */
export function hashSchedule(events: FspScheduleEvent[]): string {
  // Sort by Start, then End, then Title for deterministic ordering
  const sorted = [...events].sort((a, b) => {
    const startCmp = a.Start.localeCompare(b.Start);
    if (startCmp !== 0) return startCmp;
    const endCmp = a.End.localeCompare(b.End);
    if (endCmp !== 0) return endCmp;
    return a.Title.localeCompare(b.Title);
  });

  // Serialize each event as a stable string
  const serialized = sorted.map(
    (e) => `${e.Start}|${e.End}|${e.Title}|${e.CustomerName}|${e.InstructorName}|${e.AircraftName}`,
  );

  const payload = serialized.join('\n');

  return createHash('sha256').update(payload, 'utf-8').digest('hex');
}

// ─── Opening Detection ───────────────────────────────────────────────────────

/**
 * Build a unique key for an event to identify it across snapshots.
 *
 * Uses Start + End + Title + CustomerName as the composite identity.
 * This is sufficient because a given customer cannot have two different
 * reservations at the exact same time with the same title.
 */
function eventKey(event: FspScheduleEvent): string {
  return `${event.Start}|${event.End}|${event.Title}|${event.CustomerName}`;
}

/**
 * Parse an FSP datetime string into a JS Date.
 * FSP times are local (no TZ suffix), so we parse them as-is.
 */
function parseFspDateTime(fspTime: string): Date {
  // FSP format: "2024-03-15T10:00" or "2024-03-15T10:00:00"
  // Append seconds if missing to ensure valid Date parsing
  const normalized =
    fspTime.includes(':') && fspTime.split(':').length === 2 ? `${fspTime}:00` : fspTime;
  return new Date(normalized);
}

/**
 * Detect schedule openings by comparing a previous and current schedule snapshot.
 *
 * Finds:
 *  1. **Cancellations** — events present in `previousEvents` but absent from
 *     `currentEvents`. Each removed event produces an opening at that time slot.
 *  2. **Gaps** — time windows between consecutive current events that did not
 *     exist between consecutive previous events. This catches cases where an
 *     event was removed from the middle of a busy block.
 *
 * @param previousEvents  The schedule snapshot from the last successful poll.
 * @param currentEvents   The freshly fetched schedule snapshot.
 * @param locationId      The FSP location ID to tag openings with.
 * @returns  Array of detected openings.
 */
export function detectOpenings(
  previousEvents: FspScheduleEvent[],
  currentEvents: FspScheduleEvent[],
  locationId: string = '',
): ScheduleOpening[] {
  const openings: ScheduleOpening[] = [];

  // Build a set of current event keys for O(1) lookups
  const currentKeySet = new Set(currentEvents.map(eventKey));

  // ── 1. Cancellations: events in previous but not in current ────────────

  for (const prev of previousEvents) {
    const key = eventKey(prev);
    if (!currentKeySet.has(key)) {
      openings.push({
        start: parseFspDateTime(prev.Start),
        end: parseFspDateTime(prev.End),
        locationId,
        previousReservation: {
          // CustomerName is the best proxy for studentId from schedule data
          studentId: prev.CustomerName,
          activityTypeId: prev.Title,
        },
        type: 'cancellation',
      });
    }
  }

  // ── 2. Gaps: new gaps between consecutive current events ───────────────

  // Sort both sets by start time
  const prevSorted = [...previousEvents].sort((a, b) => a.Start.localeCompare(b.Start));
  const currSorted = [...currentEvents].sort((a, b) => a.Start.localeCompare(b.Start));

  // Compute gaps in previous schedule
  const previousGapSet = new Set<string>();
  for (let i = 0; i < prevSorted.length - 1; i++) {
    const gapStart = prevSorted[i]!.End;
    const gapEnd = prevSorted[i + 1]!.Start;
    if (gapStart < gapEnd) {
      previousGapSet.add(`${gapStart}|${gapEnd}`);
    }
  }

  // Find gaps in current schedule that did not exist in previous
  for (let i = 0; i < currSorted.length - 1; i++) {
    const gapStart = currSorted[i]!.End;
    const gapEnd = currSorted[i + 1]!.Start;

    if (gapStart < gapEnd) {
      const gapKey = `${gapStart}|${gapEnd}`;
      if (!previousGapSet.has(gapKey)) {
        // This is a new gap — the minimum gap size worth reporting is > 0 minutes
        const startDate = parseFspDateTime(gapStart);
        const endDate = parseFspDateTime(gapEnd);
        const durationMin = (endDate.getTime() - startDate.getTime()) / 60_000;

        // Only report gaps of at least 30 minutes (minimum useful booking length)
        if (durationMin >= 30) {
          openings.push({
            start: startDate,
            end: endDate,
            locationId,
            type: 'gap',
          });
        }
      }
    }
  }

  return openings;
}
