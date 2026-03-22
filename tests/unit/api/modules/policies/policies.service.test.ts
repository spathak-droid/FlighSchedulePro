import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// ─── Mock database ──────────────────────────────────────────────────────────

const mockSelectFromWhere = vi.fn();
const mockUpdateSetWhere = vi.fn();

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((...args: unknown[]) => ({
          limit: () => mockSelectFromWhere(),
        })),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: () => mockUpdateSetWhere(),
        }),
      }),
    }),
  },
}));

vi.mock('../../../../../src/db/schema/index.js', () => ({
  schedulingPolicies: {
    operatorId: 'operator_id',
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

// Must import AFTER mocks
import { PoliciesService } from '../../../../../src/api/modules/policies/policies.service.js';

describe('PoliciesService', () => {
  let service: PoliciesService;

  beforeEach(() => {
    service = new PoliciesService();
    vi.clearAllMocks();
  });

  // ── getPolicy ─────────────────────────────────────────────────────────

  describe('getPolicy', () => {
    it('returns the policy for an operator', async () => {
      const mockPolicy = { id: 'policy-1', operatorId: 1001, pollingIntervalMinutes: 5 };
      mockSelectFromWhere.mockResolvedValue([mockPolicy]);

      const result = await service.getPolicy(1001);
      expect(result).toEqual(mockPolicy);
    });

    it('throws NotFoundException when no policy exists', async () => {
      mockSelectFromWhere.mockResolvedValue([]);

      await expect(service.getPolicy(9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updatePolicy ──────────────────────────────────────────────────────

  describe('updatePolicy', () => {
    const existingPolicy = { id: 'policy-1', operatorId: 1001 };

    beforeEach(() => {
      mockSelectFromWhere.mockResolvedValue([existingPolicy]);
    });

    it('updates policy with valid data', async () => {
      const updated = { ...existingPolicy, pollingIntervalMinutes: 3 };
      mockUpdateSetWhere.mockResolvedValue([updated]);

      const result = await service.updatePolicy(1001, { pollingIntervalMinutes: 3 });
      expect(result).toEqual(updated);
    });

    it('validates pollingIntervalMinutes range (2-5)', async () => {
      await expect(service.updatePolicy(1001, { pollingIntervalMinutes: 1 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { pollingIntervalMinutes: 6 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates rescheduleAlternativesCount range (3-10)', async () => {
      await expect(service.updatePolicy(1001, { rescheduleAlternativesCount: 2 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { rescheduleAlternativesCount: 11 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates searchWindowInitialDays range (1-28)', async () => {
      await expect(service.updatePolicy(1001, { searchWindowInitialDays: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { searchWindowInitialDays: 29 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates searchWindowIncrementDays range (1-14)', async () => {
      await expect(service.updatePolicy(1001, { searchWindowIncrementDays: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { searchWindowIncrementDays: 15 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates searchWindowMaxDays range (7-56)', async () => {
      await expect(service.updatePolicy(1001, { searchWindowMaxDays: 6 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { searchWindowMaxDays: 57 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates suggestionTtlHours range (1-168)', async () => {
      await expect(service.updatePolicy(1001, { suggestionTtlHours: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updatePolicy(1001, { suggestionTtlHours: 169 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows valid boundary values', async () => {
      mockUpdateSetWhere.mockResolvedValue([existingPolicy]);

      // All at minimum
      await expect(
        service.updatePolicy(1001, {
          pollingIntervalMinutes: 2,
          rescheduleAlternativesCount: 3,
          searchWindowInitialDays: 1,
          searchWindowIncrementDays: 1,
          searchWindowMaxDays: 7,
          suggestionTtlHours: 1,
        }),
      ).resolves.toBeDefined();

      // All at maximum
      await expect(
        service.updatePolicy(1001, {
          pollingIntervalMinutes: 5,
          rescheduleAlternativesCount: 10,
          searchWindowInitialDays: 28,
          searchWindowIncrementDays: 14,
          searchWindowMaxDays: 56,
          suggestionTtlHours: 168,
        }),
      ).resolves.toBeDefined();
    });

    it('collects multiple validation errors', async () => {
      try {
        await service.updatePolicy(1001, {
          pollingIntervalMinutes: 0,
          rescheduleAlternativesCount: 0,
          suggestionTtlHours: 0,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as { message: string[] };
        // Should have 3 errors
        expect(response.message).toHaveLength(3);
      }
    });

    it('allows partial updates (only specified fields validated)', async () => {
      mockUpdateSetWhere.mockResolvedValue([existingPolicy]);

      // Only updating one field — others not validated
      await expect(
        service.updatePolicy(1001, { pollingIntervalMinutes: 3 }),
      ).resolves.toBeDefined();
    });

    it('skips validation for undefined fields', async () => {
      mockUpdateSetWhere.mockResolvedValue([existingPolicy]);

      await expect(service.updatePolicy(1001, {})).resolves.toBeDefined();
    });
  });
});
