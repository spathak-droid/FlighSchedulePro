import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock database ──────────────────────────────────────────────────────────

// Use vi.hoisted to create mocks that can be referenced in vi.mock (hoisted to top)
const { mockWhere, selectResults } = vi.hoisted(() => {
  const selectResults = { value: [] as unknown[][] };
  const mockWhere = vi.fn().mockImplementation(() => {
    const data = selectResults.value.shift() ?? [];
    return {
      then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve),
      catch: (fn: (e: unknown) => unknown) => Promise.resolve(data).catch(fn),
      groupBy: () => ({
        orderBy: () => Promise.resolve(data),
      }),
    };
  });
  return { mockWhere, selectResults };
});

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockWhere,
      }),
    }),
  },
}));

vi.mock('../../../../../src/db/schema/suggestions.js', () => ({
  suggestions: {
    operatorId: 'operator_id',
    status: 'status',
    approvedAt: 'approved_at',
    declinedAt: 'declined_at',
    updatedAt: 'updated_at',
    createdAt: 'created_at',
  },
}));

vi.mock('../../../../../src/db/schema/reservation-history.js', () => ({
  reservationHistory: {
    operatorId: 'operator_id',
    startTime: 'start_time',
    endTime: 'end_time',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  sql: Object.assign((strings: TemplateStringsArray, ..._values: unknown[]) => strings.join(''), {
    raw: (s: string) => s,
  }),
}));

import { DashboardService } from '../../../../../src/api/modules/dashboard/dashboard.service.js';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
    vi.clearAllMocks();
  });

  describe('getStats', () => {
    it('returns all dashboard stats with correct structure', async () => {
      selectResults.value = [
        [{ total: 12 }], // pending
        [{ total: 5 }], // approved today
        [{ total: 2 }], // declined today
        [{ total: 1 }], // expired today
        [{ approved: 30, declined: 10 }], // acceptance rate
        [], // weekly flight hours (groupBy query)
        [{ avgHours: 4.5 }], // time to fill
        [{ pendingCount: 12, oldestCreatedAt: new Date(Date.now() - 3600000).toISOString() }], // queue health - pending
        [{ expired: 3, total: 40 }], // queue health - expiration
        [{ avgHours: 4.5 }], // queue health -> getTimeToFill
      ];

      const stats = await service.getStats(1001);

      expect(stats.pendingSuggestions).toBe(12);
      expect(stats.approvedToday).toBe(5);
      expect(stats.declinedToday).toBe(2);
      expect(stats.expiredToday).toBe(1);
      expect(stats.acceptanceRate).toBe(75); // 30/(30+10) = 75%
    });

    it('returns null acceptance rate when no decisions made', async () => {
      selectResults.value = [
        [{ total: 0 }],
        [{ total: 0 }],
        [{ total: 0 }],
        [{ total: 0 }],
        [{ approved: 0, declined: 0 }],
        [],
        [{ avgHours: null }],
        [{ pendingCount: 0, oldestCreatedAt: null }],
        [{ expired: 0, total: 0 }],
        [{ avgHours: null }],
      ];

      const stats = await service.getStats(1001);

      expect(stats.acceptanceRate).toBeNull();
      expect(stats.pendingSuggestions).toBe(0);
    });
  });

  describe('getTimeToFill', () => {
    it('returns average hours for approved suggestions', async () => {
      selectResults.value = [[{ avgHours: 3.7 }]];

      const result = await service.getTimeToFill(1001);
      expect(result).toBe(3.7);
    });

    it('returns null when no approved suggestions exist', async () => {
      selectResults.value = [[{ avgHours: null }]];

      const result = await service.getTimeToFill(1001);
      expect(result).toBeNull();
    });

    it('rounds to one decimal place', async () => {
      selectResults.value = [[{ avgHours: 2.3456 }]];

      const result = await service.getTimeToFill(1001);
      expect(result).toBe(2.3);
    });
  });

  describe('getWeeklyFlightHours', () => {
    it('fills missing days with 0 hours', async () => {
      selectResults.value = [[]];

      const result = await service.getWeeklyFlightHours(1001);
      expect(result).toHaveLength(7);
      expect(result.every((d) => d.hours === 0)).toBe(true);
    });

    it('returns dates sorted chronologically', async () => {
      selectResults.value = [[]];

      const result = await service.getWeeklyFlightHours(1001);
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.date > result[i - 1]!.date).toBe(true);
      }
    });
  });

  describe('getQueueHealth', () => {
    it('calculates queue health metrics', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      selectResults.value = [
        [{ pendingCount: 8, oldestCreatedAt: oneHourAgo }],
        [{ expired: 5, total: 50 }],
        [{ avgHours: 2.0 }],
      ];

      const result = await service.getQueueHealth(1001);

      expect(result.pendingCount).toBe(8);
      expect(result.oldestPendingAge).toBeGreaterThan(0);
      expect(result.expirationRate).toBe(10); // 5/50 = 10%
      expect(result.avgApprovalTime).toBe(2.0);
    });

    it('returns zeroes when queue is empty', async () => {
      selectResults.value = [
        [{ pendingCount: 0, oldestCreatedAt: null }],
        [{ expired: 0, total: 0 }],
        [{ avgHours: null }],
      ];

      const result = await service.getQueueHealth(1001);

      expect(result.pendingCount).toBe(0);
      expect(result.oldestPendingAge).toBe(0);
      expect(result.expirationRate).toBe(0);
      expect(result.avgApprovalTime).toBe(0);
    });
  });
});
