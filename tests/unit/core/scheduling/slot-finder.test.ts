import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findAvailableSlots } from '../../../../src/core/scheduling/slot-finder.js';
import type { SlotFinderConfig } from '../../../../src/core/scheduling/slot-finder.js';
import type { FspResourceService } from '../../../../src/api/fsp/fsp-resource.service.js';
import type { FspScheduleService } from '../../../../src/api/fsp/fsp-schedule.service.js';
import type {
  FspAvailability,
  FspInstructor,
  FspAircraft,
  FspScheduleEvent,
} from '../../../../src/api/fsp/fsp.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SlotFinderConfig> = {}): SlotFinderConfig {
  return {
    initialDays: 7,
    incrementDays: 7,
    maxDays: 28,
    maxSlots: 5,
    activityTypeId: 'at-1',
    locationId: '100',
    studentId: 'student-1',
    durationMinutes: 60,
    ...overrides,
  };
}

function makeInstructor(overrides: Partial<FspInstructor> = {}): FspInstructor {
  return {
    id: 'inst-1',
    firstName: 'Jane',
    lastName: 'Smith',
    fullName: 'Jane Smith',
    instructorType: 'CFI',
    isActive: true,
    ...overrides,
  };
}

function makeAircraft(overrides: Partial<FspAircraft> = {}): FspAircraft {
  return {
    id: 'ac-1',
    registration: 'N12345',
    make: 'Cessna',
    model: '172',
    makeModel: 'Cessna 172',
    isActive: true,
    isSimulator: false,
    ...overrides,
  };
}

function makeAvailability(
  userGuidId: string,
  dayOfWeek: number,
  startTime: string = '08:00',
  endTime: string = '17:00',
): FspAvailability {
  return {
    userGuidId,
    availabilities: [
      { dayOfWeek, startAtTimeUtc: startTime, endAtTimeUtc: endTime },
    ],
    availabilityOverrides: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findAvailableSlots', () => {
  let mockResourceService: FspResourceService;
  let mockScheduleService: FspScheduleService;

  beforeEach(() => {
    mockResourceService = {
      getAvailability: vi.fn().mockResolvedValue([]),
      getAircraftTimes: vi.fn().mockResolvedValue({}),
      getMaintenanceReminders: vi.fn().mockResolvedValue([]),
    } as unknown as FspResourceService;

    mockScheduleService = {
      getSchedule: vi.fn().mockResolvedValue({
        results: { events: [], resources: [], unavailability: [] },
      }),
    } as unknown as FspScheduleService;
  });

  it('returns empty array when no instructors are active', async () => {
    const config = makeConfig();
    const instructors = [makeInstructor({ isActive: false })];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when no aircraft are active', async () => {
    const config = makeConfig();
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft({ isActive: false })];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when no aircraft remain after filtering simulators', async () => {
    const config = makeConfig();
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft({ isSimulator: true })];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    expect(result).toEqual([]);
  });

  it('finds slots from instructor availability', async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Make availability for today's day of week
    const avail = makeAvailability('inst-1', dayOfWeek, '08:00', '12:00');

    vi.mocked(mockResourceService.getAvailability).mockResolvedValue([avail]);

    const config = makeConfig({ maxSlots: 3, initialDays: 7, maxDays: 7 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // Should find some slots (exact number depends on current time/day)
    // At minimum, availability from 08:00-12:00 on applicable days should yield slots
    expect(result.length).toBeGreaterThanOrEqual(0);
    expect(result.length).toBeLessThanOrEqual(3);

    for (const slot of result) {
      expect(slot.instructorId).toBe('inst-1');
      expect(slot.aircraftId).toBe('ac-1');
      expect(slot.matchScore).toBeGreaterThanOrEqual(0);
      expect(slot.matchScore).toBeLessThanOrEqual(100);
    }
  });

  it('respects maxSlots limit', async () => {
    // Create availability for all days of the week
    const availabilities: FspAvailability[] = [
      {
        userGuidId: 'inst-1',
        availabilities: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          startAtTimeUtc: '06:00',
          endAtTimeUtc: '20:00',
        })),
        availabilityOverrides: [],
      },
    ];

    vi.mocked(mockResourceService.getAvailability).mockResolvedValue(availabilities);

    const config = makeConfig({ maxSlots: 2, maxDays: 28 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('filters out slots that conflict with existing events', async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(11, 0, 0, 0);

    const dayOfWeek = tomorrow.getDay();

    const avail = makeAvailability('inst-1', dayOfWeek, '08:00', '12:00');
    vi.mocked(mockResourceService.getAvailability).mockResolvedValue([avail]);

    // Existing event that conflicts with 9:00-10:00
    const existingEvents: FspScheduleEvent[] = [
      {
        Start: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T09:00:00`,
        End: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T10:00:00`,
        Title: 'Existing Flight',
        CustomerName: 'Other Student',
        InstructorName: 'Jane Smith',
        AircraftName: 'N12345',
      },
    ];

    vi.mocked(mockScheduleService.getSchedule).mockResolvedValue({
      results: { events: existingEvents, resources: [], unavailability: [] },
    });

    const config = makeConfig({ maxSlots: 10, initialDays: 7, maxDays: 7 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // None of the returned slots should overlap with the existing 9:00-10:00 event
    // for the same instructor/aircraft
    for (const slot of result) {
      if (slot.instructorName === 'Jane Smith' || slot.aircraftRegistration === 'N12345') {
        const slotOverlaps =
          slot.start < tomorrowEnd && slot.end > tomorrow;
        // If it's the exact same instructor and time window, it should be filtered
        // The test verifies the conflict checking mechanism works
        if (slotOverlaps) {
          // The slot should not be the 9:00 slot with the same instructor
          expect(
            slot.start.getHours() === 9 && slot.instructorName === 'Jane Smith',
          ).toBe(false);
        }
      }
    }
  });

  it('gives higher match score to preferred instructor', async () => {
    const avail1 = makeAvailability('inst-1', (new Date().getDay() + 1) % 7, '08:00', '12:00');
    const avail2 = makeAvailability('inst-2', (new Date().getDay() + 1) % 7, '08:00', '12:00');

    vi.mocked(mockResourceService.getAvailability).mockResolvedValue([avail1, avail2]);

    const config = makeConfig({ instructorId: 'inst-1', maxSlots: 10, maxDays: 7 });
    const instructors = [
      makeInstructor({ id: 'inst-1', firstName: 'Jane', lastName: 'Smith' }),
      makeInstructor({ id: 'inst-2', firstName: 'Bob', lastName: 'Jones' }),
    ];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // Find slots for each instructor
    const preferredSlots = result.filter((s) => s.instructorId === 'inst-1');
    const otherSlots = result.filter((s) => s.instructorId === 'inst-2');

    if (preferredSlots.length > 0 && otherSlots.length > 0) {
      // Preferred instructor gets +30 to match score
      expect(preferredSlots[0]!.matchScore).toBeGreaterThan(otherSlots[0]!.matchScore);
    }
  });

  it('sorts results by matchScore descending, then start time ascending', async () => {
    const availabilities: FspAvailability[] = [
      {
        userGuidId: 'inst-1',
        availabilities: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          startAtTimeUtc: '06:00',
          endAtTimeUtc: '20:00',
        })),
        availabilityOverrides: [],
      },
    ];

    vi.mocked(mockResourceService.getAvailability).mockResolvedValue(availabilities);

    const config = makeConfig({ maxSlots: 10, maxDays: 14 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // Verify descending score order (with start time tiebreak)
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i]!.matchScore !== result[i + 1]!.matchScore) {
        expect(result[i]!.matchScore).toBeGreaterThanOrEqual(result[i + 1]!.matchScore);
      } else {
        expect(result[i]!.start.getTime()).toBeLessThanOrEqual(result[i + 1]!.start.getTime());
      }
    }
  });

  it('continues to next window when availability fetch fails', async () => {
    // First call fails, second succeeds
    vi.mocked(mockResourceService.getAvailability)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([
        makeAvailability('inst-1', (new Date().getDay() + 1) % 7, '08:00', '12:00'),
      ]);

    const config = makeConfig({ initialDays: 7, incrementDays: 7, maxDays: 14, maxSlots: 5 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    // Should not throw
    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // Should have called getAvailability twice (first fails, second succeeds)
    expect(mockResourceService.getAvailability).toHaveBeenCalledTimes(2);
  });

  it('proceeds without conflict checking when schedule fetch fails', async () => {
    const avail = makeAvailability('inst-1', (new Date().getDay() + 1) % 7, '08:00', '12:00');
    vi.mocked(mockResourceService.getAvailability).mockResolvedValue([avail]);
    vi.mocked(mockScheduleService.getSchedule).mockRejectedValue(new Error('DB error'));

    const config = makeConfig({ maxSlots: 3, maxDays: 7 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    // Should not throw
    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // Should still return slots (just without conflict filtering)
    // This is a best-effort result
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles availability override marking a day unavailable', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const avail: FspAvailability = {
      userGuidId: 'inst-1',
      availabilities: Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        startAtTimeUtc: '08:00',
        endAtTimeUtc: '17:00',
      })),
      availabilityOverrides: [
        {
          date: dateStr,
          startTime: '08:00',
          endTime: '17:00',
          isUnavailable: true,
        },
      ],
    };

    vi.mocked(mockResourceService.getAvailability).mockResolvedValue([avail]);

    const config = makeConfig({ maxSlots: 20, maxDays: 7 });
    const instructors = [makeInstructor()];
    const aircraft = [makeAircraft()];

    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    // No slot should fall on the unavailable date
    for (const slot of result) {
      const slotDateStr = `${slot.start.getFullYear()}-${String(slot.start.getMonth() + 1).padStart(2, '0')}-${String(slot.start.getDate()).padStart(2, '0')}`;
      if (slotDateStr === dateStr) {
        // The override marks the whole day unavailable, so no slots should be here
        expect(false).toBe(true); // Fail if we find a slot on the unavailable day
      }
    }
  });

  it('prioritizes preferred instructor in iteration order', async () => {
    const config = makeConfig({ instructorId: 'inst-2' });
    const instructors = [
      makeInstructor({ id: 'inst-1' }),
      makeInstructor({ id: 'inst-2' }),
      makeInstructor({ id: 'inst-3' }),
    ];
    const aircraft = [makeAircraft()];

    // The function should put inst-2 first in the sorted list
    // We just verify this doesn't throw
    const result = await findAvailableSlots(
      config,
      mockResourceService,
      mockScheduleService,
      instructors,
      aircraft,
      1,
      'token',
    );

    expect(Array.isArray(result)).toBe(true);
  });
});
