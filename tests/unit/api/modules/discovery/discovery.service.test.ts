import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { selectResults, insertResults, updateResults } = vi.hoisted(() => ({
  selectResults: { value: [] as unknown[][] },
  insertResults: { value: [] as unknown[][] },
  updateResults: { value: [] as unknown[][] },
}));

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const data = selectResults.value.shift() ?? [];
          return {
            limit: () => Promise.resolve(data),
            then: (r: (v: unknown) => void) => Promise.resolve(data).then(r),
          };
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(() => ({
        returning: (cols?: unknown) => Promise.resolve(insertResults.value.shift() ?? []),
      })),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => ({
          returning: () => Promise.resolve(updateResults.value.shift() ?? []),
          then: (r: (v: unknown) => void) =>
            Promise.resolve(updateResults.value.shift() ?? []).then(r),
        })),
      }),
    }),
  },
}));

vi.mock('../../../../../src/db/schema/prospects.js', () => ({
  prospects: { id: 'id', operatorId: 'operator_id', status: 'status' },
}));
vi.mock('../../../../../src/db/schema/suggestions.js', () => ({
  suggestions: {
    id: 'id',
    operatorId: 'operator_id',
    status: 'status',
    type: 'type',
    proposedStart: 'proposed_start',
    proposedEnd: 'proposed_end',
    instructorId: 'instructor_id',
    aircraftId: 'aircraft_id',
    rankingScore: 'ranking_score',
    groupId: 'group_id',
  },
}));
vi.mock('../../../../../src/db/schema/reservation-history.js', () => ({ reservationHistory: {} }));
vi.mock('../../../../../src/db/schema/instructors.js', () => ({ instructors: { id: 'id' } }));
vi.mock('../../../../../src/db/schema/aircraft.js', () => ({ aircraft: { id: 'id' } }));
vi.mock('../../../../../src/db/schema/activity-types.js', () => ({ activityTypes: { id: 'id' } }));
vi.mock('../../../../../src/db/schema/scheduling-policies.js', () => ({
  schedulingPolicies: { operatorId: 'operator_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: unknown[]) => a),
  and: vi.fn((...a: unknown[]) => a),
}));

vi.mock('../../../../../src/core/scheduling/constraint-evaluator.js', () => ({
  filterDaylightSlots: vi.fn((slots: unknown[]) => slots),
}));

vi.mock('../../../../../src/core/scheduling/rationale-builder.js', () => ({
  buildRationale: vi.fn(() => ({
    summary: 'Discovery flight suggestion',
    inputs: [],
    constraints: [],
    policies: [],
  })),
}));

import { DiscoveryService } from '../../../../../src/api/modules/discovery/discovery.service.js';

// ─── Mock Dependencies ──────────────────────────────────────────────────────

function createMockFspResourceService() {
  return {
    getLocations: vi.fn().mockResolvedValue([{ id: 'loc-1', name: 'KABC', isActive: true }]),
    getActivityTypes: vi
      .fn()
      .mockResolvedValue([{ id: 'at-disc', name: 'Discovery Flight', isActive: true }]),
    getCivilTwilight: vi.fn().mockResolvedValue({
      startDate: '2026-03-25T06:30',
      endDate: '2026-03-25T18:45',
    }),
  };
}

function createMockFspScheduleService() {
  return {
    validateReservation: vi.fn(),
    createReservation: vi.fn(),
  };
}

function createMockAuditService() {
  return { create: vi.fn().mockResolvedValue(undefined) };
}

function createMockNotificationService() {
  return { sendBookingConfirmation: vi.fn().mockResolvedValue(undefined) };
}

function createMockSolverService() {
  return {
    findTime: vi.fn().mockResolvedValue([
      {
        start: new Date('2026-03-25T10:00:00'),
        end: new Date('2026-03-25T11:00:00'),
        instructorId: 'inst-1',
        aircraftId: 'ac-1',
        instructorName: 'John Smith',
        aircraftRegistration: 'N172SP',
        matchScore: 85,
      },
      {
        start: new Date('2026-03-25T14:00:00'),
        end: new Date('2026-03-25T15:00:00'),
        instructorId: 'inst-2',
        aircraftId: 'ac-2',
        instructorName: 'Jane Doe',
        aircraftRegistration: 'N182RG',
        matchScore: 72,
      },
    ]),
  };
}

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-disc-1',
    operatorId: 1001,
    status: 'pending',
    type: 'discovery',
    locationId: 'loc-1',
    studentId: 'prospect:John Doe',
    prospectId: 'prospect-1',
    instructorId: 'inst-1',
    aircraftId: 'ac-1',
    activityTypeId: 'at-disc',
    proposedStart: new Date('2026-03-25T10:00:00'),
    proposedEnd: new Date('2026-03-25T11:00:00'),
    groupId: 'group-disc-1',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let mockFspResource: ReturnType<typeof createMockFspResourceService>;
  let mockAudit: ReturnType<typeof createMockAuditService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let mockSolver: ReturnType<typeof createMockSolverService>;

  beforeEach(() => {
    mockFspResource = createMockFspResourceService();
    mockAudit = createMockAuditService();
    mockNotification = createMockNotificationService();
    mockSolver = createMockSolverService();

    service = new DiscoveryService(
      mockFspResource as any,
      createMockFspScheduleService() as any,
      mockAudit as any,
      mockNotification as any,
      mockSolver as any,
    );

    vi.clearAllMocks();
  });

  // ── createDiscoveryRequest ────────────────────────────────────────────

  describe('createDiscoveryRequest', () => {
    it('throws BadRequestException when firstName missing', async () => {
      await expect(
        service.createDiscoveryRequest(1001, { firstName: '', lastName: 'Doe' }, 'token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when lastName missing', async () => {
      await expect(
        service.createDiscoveryRequest(1001, { firstName: 'John', lastName: '' }, 'token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates prospect and returns suggestions on success', async () => {
      const prospect = {
        id: 'prospect-1',
        firstName: 'John',
        lastName: 'Doe',
        status: 'pending',
        email: null,
        phone: null,
      };

      insertResults.value = [
        [prospect], // prospect insert
        // suggestions insert returns enriched records
        [
          {
            id: 'sug-1',
            proposedStart: new Date('2026-03-25T10:00:00'),
            proposedEnd: new Date('2026-03-25T11:00:00'),
            instructorId: 'inst-1',
            aircraftId: 'ac-1',
            rankingScore: '85.0000',
          },
        ],
      ];

      selectResults.value = [
        [{ suggestionTtlHours: 24, rescheduleAlternativesCount: 5, searchWindowMaxDays: 28 }], // policy
      ];

      const result = await service.createDiscoveryRequest(
        1001,
        { firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
        'fsp-token',
      );

      expect(result.prospect.id).toBe('prospect-1');
      expect(result.prospect.firstName).toBe('John');
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(mockSolver.findTime).toHaveBeenCalled();
      expect(mockAudit.create).toHaveBeenCalled();
    });

    it('returns empty suggestions when no active locations', async () => {
      mockFspResource.getLocations.mockResolvedValue([]); // no active locations

      const prospect = {
        id: 'prospect-2',
        firstName: 'Jane',
        lastName: 'Doe',
        status: 'pending',
      };
      insertResults.value = [[prospect]];
      selectResults.value = []; // no policy needed since we return early

      const result = await service.createDiscoveryRequest(
        1001,
        { firstName: 'Jane', lastName: 'Doe' },
        'fsp-token',
      );

      expect(result.suggestions).toHaveLength(0);
      expect(result.prospect.id).toBe('prospect-2');
    });

    it('returns empty suggestions when solver finds no slots', async () => {
      mockSolver.findTime.mockResolvedValue([]);

      const prospect = {
        id: 'prospect-3',
        firstName: 'Bob',
        lastName: 'Smith',
        status: 'pending',
      };
      insertResults.value = [[prospect]];
      selectResults.value = [
        [{ suggestionTtlHours: 24, rescheduleAlternativesCount: 5, searchWindowMaxDays: 28 }],
      ];

      const result = await service.createDiscoveryRequest(
        1001,
        { firstName: 'Bob', lastName: 'Smith' },
        'fsp-token',
      );

      expect(result.suggestions).toHaveLength(0);
    });

    it('gracefully handles civil twilight fetch failure', async () => {
      mockFspResource.getCivilTwilight.mockRejectedValue(new Error('API error'));

      const prospect = {
        id: 'prospect-4',
        firstName: 'Test',
        lastName: 'User',
        status: 'pending',
      };
      insertResults.value = [
        [prospect],
        [
          {
            id: 'sug-1',
            proposedStart: new Date(),
            proposedEnd: new Date(),
            instructorId: 'i',
            aircraftId: 'a',
            rankingScore: '50',
          },
        ],
      ];
      selectResults.value = [
        [{ suggestionTtlHours: 24, rescheduleAlternativesCount: 5, searchWindowMaxDays: 28 }],
      ];

      // Should NOT throw
      const result = await service.createDiscoveryRequest(
        1001,
        { firstName: 'Test', lastName: 'User' },
        'fsp-token',
      );

      expect(result.prospect.id).toBe('prospect-4');
    });
  });

  // ── bookSlot ──────────────────────────────────────────────────────────

  describe('bookSlot', () => {
    it('books a discovery flight and updates all entities', async () => {
      const sug = makeSuggestion();
      const prospect = {
        id: 'prospect-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
      };

      selectResults.value = [
        [sug], // load suggestion
        [prospect], // load prospect
        [{ id: 'inst-1', firstName: 'Mike', lastName: 'Jones' }], // instructor
        [{ id: 'ac-1', registration: 'N172SP' }], // aircraft
        [{ id: 'at-disc', name: 'Discovery Flight' }], // activity type
      ];
      insertResults.value = [[]]; // reservation insert
      updateResults.value = [
        [], // approve suggestion
        [], // expire siblings
        [], // update prospect to booked
      ];

      const result = await service.bookSlot(1001, 'sug-disc-1', 'user-1');

      expect(result.booking.status).toBe('booked');
      expect(result.booking.prospectName).toBe('John Doe');
      expect(result.booking.instructorName).toBe('Mike Jones');
      expect(result.booking.aircraftRegistration).toBe('N172SP');
      expect(result.booking.activityType).toBe('Discovery Flight');
      expect(mockAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'discovery_booked',
          actorId: 'user-1',
        }),
      );
    });

    it('throws NotFoundException when suggestion not found', async () => {
      selectResults.value = [[]];

      await expect(service.bookSlot(1001, 'missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when suggestion not pending', async () => {
      selectResults.value = [[makeSuggestion({ status: 'approved' })]];

      await expect(service.bookSlot(1001, 'sug-disc-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when suggestion is not discovery type', async () => {
      selectResults.value = [[makeSuggestion({ type: 'waitlist' })]];

      await expect(service.bookSlot(1001, 'sug-disc-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('continues even if email notification fails', async () => {
      const sug = makeSuggestion();
      mockNotification.sendBookingConfirmation.mockRejectedValue(new Error('SMTP down'));

      selectResults.value = [
        [sug],
        [{ id: 'prospect-1', firstName: 'John', lastName: 'Doe', email: null }],
        [],
        [],
        [], // instructor, aircraft, activity type (not found)
      ];
      insertResults.value = [[]];
      updateResults.value = [[], [], []];

      const result = await service.bookSlot(1001, 'sug-disc-1', 'user-1');

      expect(result.emailSent).toBe(false);
      expect(result.booking.status).toBe('booked');
    });

    it('handles missing prospect gracefully', async () => {
      const sug = makeSuggestion({ prospectId: 'gone' });

      selectResults.value = [
        [sug],
        [], // prospect not found
        [],
        [],
        [], // instructor, aircraft, activity type
      ];
      insertResults.value = [[]];
      updateResults.value = [[], []]; // approve, expire

      const result = await service.bookSlot(1001, 'sug-disc-1', 'user-1');

      expect(result.booking.prospectName).toBe('Guest');
      expect(result.booking.status).toBe('booked');
    });
  });
});
