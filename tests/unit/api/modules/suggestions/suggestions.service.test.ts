import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { selectResults, updateResults, insertResults } = vi.hoisted(() => ({
  selectResults: { value: [] as unknown[][] },
  updateResults: { value: [] as unknown[][] },
  insertResults: { value: [] as unknown[][] },
}));

vi.mock('../../../../../src/db/index.js', () => {
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => ({
        returning: () => Promise.resolve(updateResults.value.shift() ?? []),
        then: (r: (v: unknown) => void) =>
          Promise.resolve(updateResults.value.shift() ?? []).then(r),
      })),
    }),
  });

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const data = selectResults.value.shift() ?? [];
        return {
          orderBy: () => ({
            limit: () => ({
              offset: () => Promise.resolve(data),
            }),
          }),
          limit: () => Promise.resolve(data),
          then: (r: (v: unknown) => void) => Promise.resolve(data).then(r),
        };
      }),
    }),
  });

  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation(() => Promise.resolve(insertResults.value.shift() ?? [])),
  });

  return { db: { select: mockSelect, update: mockUpdate, insert: mockInsert } };
});

vi.mock('../../../../../src/db/schema/index.js', () => ({
  suggestions: {
    id: 'id',
    operatorId: 'operator_id',
    status: 'status',
    type: 'type',
    locationId: 'location_id',
    proposedStart: 'proposed_start',
    proposedEnd: 'proposed_end',
    rankingScore: 'ranking_score',
    createdAt: 'created_at',
    groupId: 'group_id',
    rationale: 'rationale',
  },
  reservationHistory: {},
  prospects: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: unknown[]) => a),
  and: vi.fn((...a: unknown[]) => a),
  desc: vi.fn((c: unknown) => c),
  asc: vi.fn((c: unknown) => c),
  gte: vi.fn((...a: unknown[]) => a),
  lte: vi.fn((...a: unknown[]) => a),
  sql: Object.assign((s: TemplateStringsArray) => s.join(''), { raw: (s: string) => s }),
  SQL: class {},
}));

vi.mock('../../../../../src/core/utils/time.js', () => ({
  toFspLocalTime: vi.fn((d: Date) => d.toISOString()),
}));

import { SuggestionsService } from '../../../../../src/api/modules/suggestions/suggestions.service.js';

// ─── Mock Dependencies ──────────────────────────────────────────────────────

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

function createMockQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    operatorId: 1001,
    status: 'pending',
    type: 'waitlist',
    locationId: 'loc-1',
    studentId: 'stu-1',
    instructorId: 'inst-1',
    aircraftId: 'ac-1',
    activityTypeId: 'at-1',
    proposedStart: new Date('2026-03-25T10:00:00'),
    proposedEnd: new Date('2026-03-25T11:00:00'),
    rankingScore: '0.7500',
    groupId: 'group-1',
    prospectId: null,
    courseId: null,
    lessonId: null,
    enrollmentId: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let mockFsp: ReturnType<typeof createMockFspScheduleService>;
  let mockAudit: ReturnType<typeof createMockAuditService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    mockFsp = createMockFspScheduleService();
    mockAudit = createMockAuditService();
    mockNotification = createMockNotificationService();
    mockQueue = createMockQueue();

    service = new SuggestionsService(
      mockFsp as any,
      mockAudit as any,
      mockNotification as any,
      mockQueue as any,
    );

    vi.clearAllMocks();
  });

  // ── getById ─────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns a suggestion when found', async () => {
      const sug = makeSuggestion();
      selectResults.value = [[sug]];

      const result = await service.getById(1001, 'sug-1');
      expect(result).toEqual(sug);
    });

    it('throws NotFoundException when not found', async () => {
      selectResults.value = [[]];

      await expect(service.getById(1001, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── approve ─────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('completes full approval workflow on success', async () => {
      const sug = makeSuggestion();
      const approved = { ...sug, status: 'approved', fspReservationId: 'res-123' };

      // getById -> lock -> validate -> create -> approve update -> expire siblings
      selectResults.value = [[sug]]; // getById
      updateResults.value = [
        [sug], // lock (set processing)
        [approved], // approve update
        [], // expire siblings
      ];
      mockFsp.validateReservation.mockResolvedValue({ id: null, errors: [] });
      mockFsp.createReservation.mockResolvedValue({ id: 'res-123' });

      const result = await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');

      expect(result.reservation?.id).toBe('res-123');
      expect(mockFsp.validateReservation).toHaveBeenCalled();
      expect(mockFsp.createReservation).toHaveBeenCalled();
      expect(mockAudit.create).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('throws ConflictException when suggestion is not pending', async () => {
      selectResults.value = [[makeSuggestion({ status: 'approved' })]];

      await expect(service.approve(1001, 'sug-1', 'user-1', 'fsp-token')).rejects.toThrow(
        ConflictException,
      );
    });

    it('reverts to pending on FSP validation failure', async () => {
      const sug = makeSuggestion();
      const reverted = {
        ...sug,
        status: 'pending',
        fspValidationErrors: [{ message: 'conflict' }],
      };

      selectResults.value = [[sug]];
      updateResults.value = [
        [sug], // lock
        [reverted], // revert to pending
      ];
      mockFsp.validateReservation.mockResolvedValue({
        errors: [{ message: 'Schedule conflict' }],
      });

      const result = await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');

      expect(result.suggestion.status).toBe('pending');
      expect(result.reservation?.errors).toHaveLength(1);
      expect(mockFsp.createReservation).not.toHaveBeenCalled();
    });

    it('reverts to pending on FSP creation failure', async () => {
      const sug = makeSuggestion();
      const reverted = { ...sug, status: 'pending' };

      selectResults.value = [[sug]];
      updateResults.value = [
        [sug], // lock
        [reverted], // revert
      ];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation.mockResolvedValue({
        errors: [{ message: 'Aircraft unavailable' }],
      });

      const result = await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');

      expect(result.suggestion.status).toBe('pending');
    });

    it('throws ConflictException on concurrent modification (lock fails)', async () => {
      selectResults.value = [[makeSuggestion()]];
      updateResults.value = [[undefined]]; // lock returns nothing

      await expect(service.approve(1001, 'sug-1', 'user-1', 'fsp-token')).rejects.toThrow(
        ConflictException,
      );
    });

    it('audits the approval event', async () => {
      const sug = makeSuggestion();
      const approved = { ...sug, status: 'approved' };

      selectResults.value = [[sug]];
      updateResults.value = [[sug], [approved], []];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation.mockResolvedValue({ id: 'res-1' });

      await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');

      expect(mockAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 1001,
          eventType: 'suggestion_approved',
          entityId: 'sug-1',
          actorId: 'user-1',
        }),
      );
    });

    it('enqueues notification job after approval', async () => {
      const sug = makeSuggestion();
      const approved = { ...sug, status: 'approved' };

      selectResults.value = [[sug]];
      updateResults.value = [[sug], [approved], []];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation.mockResolvedValue({ id: 'res-1' });

      await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('notify-sug-1'),
        expect.objectContaining({ operatorId: 1001, suggestionId: 'sug-1' }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('continues even if notification enqueue fails', async () => {
      const sug = makeSuggestion();
      const approved = { ...sug, status: 'approved' };

      selectResults.value = [[sug]];
      updateResults.value = [[sug], [approved], []];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation.mockResolvedValue({ id: 'res-1' });
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      // Should NOT throw
      const result = await service.approve(1001, 'sug-1', 'user-1', 'fsp-token');
      expect(result.suggestion.status).toBe('approved');
    });
  });

  // ── decline ─────────────────────────────────────────────────────────────

  describe('decline', () => {
    it('declines a pending suggestion', async () => {
      const sug = makeSuggestion();
      const declined = { ...sug, status: 'declined', declinedBy: 'user-1' };

      selectResults.value = [[sug]];
      updateResults.value = [[declined]];

      const result = await service.decline(1001, 'sug-1', 'user-1', 'Not needed');

      expect(result.status).toBe('declined');
      expect(mockAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'suggestion_declined',
          actorId: 'user-1',
        }),
      );
    });

    it('throws ConflictException when not pending', async () => {
      selectResults.value = [[makeSuggestion({ status: 'expired' })]];

      await expect(service.decline(1001, 'sug-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on concurrent modification', async () => {
      selectResults.value = [[makeSuggestion()]];
      updateResults.value = [[undefined]];

      await expect(service.decline(1001, 'sug-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── bulkApprove ─────────────────────────────────────────────────────────

  describe('bulkApprove', () => {
    it('processes multiple approvals independently', async () => {
      const sug1 = makeSuggestion({ id: 'sug-1' });
      const sug2 = makeSuggestion({ id: 'sug-2' });
      const approved1 = { ...sug1, status: 'approved', fspReservationId: 'res-1' };
      const approved2 = { ...sug2, status: 'approved', fspReservationId: 'res-2' };

      // Results for sug-1 approval flow
      selectResults.value = [
        [sug1], // getById sug-1
        [sug2], // getById sug-2
      ];
      updateResults.value = [
        [sug1],
        [approved1],
        [], // sug-1: lock, approve, expire
        [sug2],
        [approved2],
        [], // sug-2: lock, approve, expire
      ];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation
        .mockResolvedValueOnce({ id: 'res-1' })
        .mockResolvedValueOnce({ id: 'res-2' });

      const result = await service.bulkApprove(1001, ['sug-1', 'sug-2'], 'user-1', 'fsp-token');

      expect(result.summary.approved).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('isolates failures — one bad approval does not block others', async () => {
      const sug1 = makeSuggestion({ id: 'sug-1', status: 'expired' }); // will fail
      const sug2 = makeSuggestion({ id: 'sug-2' });
      const approved2 = { ...sug2, status: 'approved' };

      selectResults.value = [
        [sug1], // getById sug-1 (status=expired -> ConflictException)
        [sug2], // getById sug-2
      ];
      updateResults.value = [
        [sug2],
        [approved2],
        [], // sug-2 flow
      ];
      mockFsp.validateReservation.mockResolvedValue({ errors: [] });
      mockFsp.createReservation.mockResolvedValue({ id: 'res-2' });

      const result = await service.bulkApprove(1001, ['sug-1', 'sug-2'], 'user-1', 'fsp-token');

      expect(result.summary.failed).toBe(1);
      expect(result.summary.approved).toBe(1);
      expect(result.results[0]!.status).toBe('failed');
      expect(result.results[1]!.status).toBe('approved');
    });
  });

  // ── bulkDecline ─────────────────────────────────────────────────────────

  describe('bulkDecline', () => {
    it('declines multiple suggestions', async () => {
      const sug1 = makeSuggestion({ id: 'sug-1' });
      const sug2 = makeSuggestion({ id: 'sug-2' });

      selectResults.value = [[sug1], [sug2]];
      updateResults.value = [[{ ...sug1, status: 'declined' }], [{ ...sug2, status: 'declined' }]];

      const result = await service.bulkDecline(
        1001,
        ['sug-1', 'sug-2'],
        'user-1',
        'No longer needed',
      );

      expect(result.summary.declined).toBe(2);
      expect(result.summary.failed).toBe(0);
    });
  });
});
