/**
 * T075: Slot finder with progressive search window expansion.
 *
 * Searches for available time slots using FSP availability APIs,
 * progressively expanding the search window (7d -> 14d -> 21d -> 28d)
 * until enough slots are found or the cap is reached.
 *
 * Slots are scored by how well they match preferences:
 * - Same instructor as original reservation (instructor continuity)
 * - Same aircraft type
 * - Similar time of day
 */

import type { FspResourceService } from '../../api/fsp/fsp-resource.service.js';
import type { FspScheduleService } from '../../api/fsp/fsp-schedule.service.js';
import type {
  FspAvailability,
  FspAvailabilityEntry,
  FspAvailabilityOverride,
  FspScheduleEvent,
  FspInstructor,
  FspAircraft,
} from '../../api/fsp/fsp.types.js';

// ─── Public Interfaces ──────────────────────────────────────────────────────

export interface SlotFinderConfig {
  /** Days to search in the first pass (default 7). */
  initialDays: number;
  /** Days to add on each expansion pass (default 7). */
  incrementDays: number;
  /** Maximum days to search from today (default 28). */
  maxDays: number;
  /** Max number of slots to return (default 5). */
  maxSlots: number;
  /** FSP activity type ID for the reservation. */
  activityTypeId: string;
  /** FSP location ID. */
  locationId: string;
  /** FSP student/pilot ID. */
  studentId: string;
  /** Preferred instructor ID (for continuity scoring). */
  instructorId?: string;
  /** Preferred aircraft ID (for match scoring). */
  aircraftId?: string;
  /** Duration of the lesson in minutes. */
  durationMinutes: number;
}

export interface FoundSlot {
  /** Proposed start time. */
  start: Date;
  /** Proposed end time. */
  end: Date;
  /** Instructor ID. */
  instructorId: string;
  /** Instructor display name. */
  instructorName: string;
  /** Aircraft ID. */
  aircraftId: string;
  /** Aircraft registration. */
  aircraftRegistration: string;
  /** Score 0-100 indicating how well this matches preferences. */
  matchScore: number;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Add days to a Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Format a Date to FSP local-time string (YYYY-MM-DDTHH:mm).
 */
function toFspLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * Format a Date to YYYY-MM-DD.
 */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate candidate time slots from instructor availability windows.
 *
 * For each day in the window, checks the instructor's recurring availability
 * (by day-of-week) and any overrides, then generates slots at 30-minute
 * intervals that fit within available windows.
 */
function generateCandidateSlots(
  availability: FspAvailability,
  windowStart: Date,
  windowEnd: Date,
  durationMinutes: number,
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  const INTERVAL_MINUTES = 30;

  const current = new Date(windowStart);
  current.setHours(0, 0, 0, 0);

  while (current <= windowEnd) {
    const dayOfWeek = current.getDay(); // 0=Sunday
    const dateStr = toDateString(current);

    // Check for overrides on this date
    const override = availability.availabilityOverrides?.find((o: FspAvailabilityOverride) =>
      o.date?.startsWith(dateStr),
    );

    if (override) {
      if (override.isUnavailable) {
        // Instructor unavailable this day
        current.setDate(current.getDate() + 1);
        continue;
      }

      // Use override times
      const overrideStart = parseTimeToMinutes(override.startTime);
      const overrideEnd = parseTimeToMinutes(override.endTime);

      for (let m = overrideStart; m + durationMinutes <= overrideEnd; m += INTERVAL_MINUTES) {
        const slotStart = new Date(current);
        slotStart.setHours(Math.floor(m / 60), m % 60, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

        if (slotStart >= windowStart) {
          slots.push({ start: slotStart, end: slotEnd });
        }
      }
    } else {
      // Use recurring availability for this day of week
      const entries =
        availability.availabilities?.filter(
          (a: FspAvailabilityEntry) => a.dayOfWeek === dayOfWeek,
        ) ?? [];

      for (const entry of entries) {
        const entryStart = parseTimeToMinutes(entry.startAtTimeUtc);
        const entryEnd = parseTimeToMinutes(entry.endAtTimeUtc);

        for (let m = entryStart; m + durationMinutes <= entryEnd; m += INTERVAL_MINUTES) {
          const slotStart = new Date(current);
          slotStart.setHours(Math.floor(m / 60), m % 60, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

          if (slotStart >= windowStart) {
            slots.push({ start: slotStart, end: slotEnd });
          }
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/**
 * Parse a time string like "08:00" or "2024-01-01T08:00:00" to minutes from midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
  // Handle full datetime strings
  const timePart = timeStr.includes('T') ? timeStr.split('T')[1]! : timeStr;
  const parts = timePart.split(':');
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  return hours * 60 + minutes;
}

/**
 * Check whether a candidate slot conflicts with existing schedule events.
 */
function hasConflict(
  slotStart: Date,
  slotEnd: Date,
  existingEvents: FspScheduleEvent[],
  instructorName: string,
  aircraftName: string,
): boolean {
  for (const event of existingEvents) {
    const eventStart = new Date(event.Start);
    const eventEnd = new Date(event.End);

    // Check time overlap
    if (slotStart < eventEnd && slotEnd > eventStart) {
      // Conflict if same instructor or same aircraft
      if (event.InstructorName === instructorName || event.AircraftName === aircraftName) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate a match score (0-100) based on preference alignment.
 */
function calculateMatchScore(
  instructorId: string,
  aircraftId: string,
  slotStart: Date,
  preferredInstructorId?: string,
  preferredAircraftId?: string,
  originalStart?: Date,
): number {
  let score = 50; // Base score

  // Instructor continuity: +30 if same instructor
  if (preferredInstructorId && instructorId === preferredInstructorId) {
    score += 30;
  }

  // Aircraft match: +10 if same aircraft
  if (preferredAircraftId && aircraftId === preferredAircraftId) {
    score += 10;
  }

  // Time-of-day match: +10 if within 2 hours of original time
  if (originalStart) {
    const originalMinutes = originalStart.getHours() * 60 + originalStart.getMinutes();
    const slotMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
    const timeDiff = Math.abs(originalMinutes - slotMinutes);
    if (timeDiff <= 120) {
      score += 10;
    }
  }

  return Math.min(score, 100);
}

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Find available slots using progressive search window expansion.
 *
 * Strategy:
 * 1. Start with `initialDays` window from now
 * 2. Fetch instructor availability for that window
 * 3. Generate candidate slots from availability
 * 4. Filter out conflicts with existing schedule
 * 5. If not enough slots found, expand by `incrementDays` and repeat
 * 6. Stop when `maxSlots` found or `maxDays` reached
 *
 * @param config            Slot finder configuration.
 * @param fspResourceService  FSP resource service for availability queries.
 * @param fspScheduleService  FSP schedule service for conflict checking.
 * @param instructors        Available instructors to consider.
 * @param aircraft           Available aircraft to consider.
 * @param operatorId         Operator ID.
 * @param token              FSP auth token.
 * @param originalStart      Original reservation start (for time-of-day scoring).
 */
export async function findAvailableSlots(
  config: SlotFinderConfig,
  fspResourceService: FspResourceService,
  fspScheduleService: FspScheduleService,
  instructors: FspInstructor[],
  aircraft: FspAircraft[],
  operatorId: number,
  token: string,
  originalStart?: Date,
): Promise<FoundSlot[]> {
  const foundSlots: FoundSlot[] = [];
  const seenSlotKeys = new Set<string>();

  const now = new Date();
  let searchDays = config.initialDays;

  // Only search active instructors and aircraft
  const activeInstructors = instructors.filter((i) => i.isActive);
  const activeAircraft = aircraft.filter((a) => a.isActive && !a.isSimulator);

  if (activeInstructors.length === 0 || activeAircraft.length === 0) {
    return [];
  }

  // Prioritize preferred instructor if specified
  const sortedInstructors = config.instructorId
    ? [
        ...activeInstructors.filter((i) => i.id === config.instructorId),
        ...activeInstructors.filter((i) => i.id !== config.instructorId),
      ]
    : activeInstructors;

  while (searchDays <= config.maxDays && foundSlots.length < config.maxSlots) {
    const windowStart = addDays(now, searchDays - config.initialDays);
    const windowEnd = addDays(now, searchDays);

    // Fetch availability for all candidate instructors in this window
    const instructorIds = sortedInstructors.map((i) => i.id);

    let availabilities: FspAvailability[] = [];
    try {
      availabilities = await fspResourceService.getAvailability(operatorId, token, {
        userGuidIds: instructorIds,
        startAtUtc: toFspLocal(windowStart),
        endAtUtc: toFspLocal(windowEnd),
      });
    } catch {
      // If availability fetch fails, move to next window
      searchDays += config.incrementDays;
      continue;
    }

    // Fetch existing schedule for conflict checking
    let existingEvents: FspScheduleEvent[] = [];
    try {
      const scheduleResponse = await fspScheduleService.getSchedule(operatorId, token, {
        start: toFspLocal(windowStart),
        end: toFspLocal(windowEnd),
        locationIds: [Number(config.locationId)],
      });
      existingEvents = scheduleResponse.results?.events ?? [];
    } catch {
      // If schedule fetch fails, proceed without conflict checking
    }

    // Generate candidate slots from each instructor's availability
    for (const avail of availabilities) {
      const instructor = sortedInstructors.find((i) => i.id === avail.userGuidId);
      if (!instructor) continue;

      const candidates = generateCandidateSlots(
        avail,
        windowStart,
        windowEnd,
        config.durationMinutes,
      );

      for (const candidate of candidates) {
        if (foundSlots.length >= config.maxSlots) break;

        // One slot per instructor per time — pick the first available aircraft
        const instructorTimeKey = `${toFspLocal(candidate.start)}|${instructor.id}`;
        if (seenSlotKeys.has(instructorTimeKey)) continue;

        const instructorName = `${instructor.firstName} ${instructor.lastName}`;

        // Find the first aircraft without a conflict
        let bestCraft: (typeof activeAircraft)[0] | null = null;
        for (const craft of activeAircraft) {
          if (
            !hasConflict(
              candidate.start,
              candidate.end,
              existingEvents,
              instructorName,
              craft.registration,
            )
          ) {
            bestCraft = craft;
            break;
          }
        }

        if (!bestCraft) continue; // No aircraft available at this time

        seenSlotKeys.add(instructorTimeKey);

        const matchScore = calculateMatchScore(
          instructor.id,
          bestCraft.id,
          candidate.start,
          config.instructorId,
          config.aircraftId,
          originalStart,
        );

        foundSlots.push({
          start: candidate.start,
          end: candidate.end,
          instructorId: instructor.id,
          instructorName: instructorName,
          aircraftId: bestCraft.id,
          aircraftRegistration: bestCraft.registration,
          matchScore,
        });
      }
    }

    // Expand search window for next iteration
    searchDays += config.incrementDays;
  }

  // Sort by match score descending, then by start time ascending
  foundSlots.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.start.getTime() - b.start.getTime();
  });

  // Return at most maxSlots
  return foundSlots.slice(0, config.maxSlots);
}
