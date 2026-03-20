import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { suggestions } from '../../../db/schema/suggestions.js';
import { reservationHistory } from '../../../db/schema/reservation-history.js';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface WeeklyFlightHour {
  date: string;
  hours: number;
}

export interface QueueHealth {
  pendingCount: number;
  oldestPendingAge: number; // hours
  avgApprovalTime: number; // hours
  expirationRate: number; // percentage
}

export interface DashboardStats {
  pendingSuggestions: number;
  approvedToday: number;
  declinedToday: number;
  expiredToday: number;
  acceptanceRate: number | null;
  weeklyFlightHours: WeeklyFlightHour[];
  timeToFill: number | null; // average hours from creation to approval
  queueHealth: QueueHealth;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  /**
   * Get dashboard statistics for an operator.
   *
   * - pendingSuggestions: count where status=pending
   * - approvedToday: count where status=approved and approvedAt >= start of today
   * - declinedToday: count where status=declined and declinedAt >= start of today
   * - expiredToday: count where status=expired and updatedAt >= start of today
   * - acceptanceRate: approved / (approved + declined) in last 30 days
   * - weeklyFlightHours: hours per day for the past 7 days
   * - timeToFill: average hours from suggestion creation to approval
   * - queueHealth: pending count, oldest pending age, avg approval time, expiration rate
   */
  async getStats(operatorId: number): Promise<DashboardStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run all count queries in parallel with individual error isolation.
    // If one query fails (e.g., table schema issue), we still return partial data.
    const [
      pendingResult,
      approvedTodayResult,
      declinedTodayResult,
      expiredTodayResult,
      acceptanceRateResult,
      weeklyFlightHours,
      timeToFill,
      queueHealth,
    ] = await Promise.all([
      // Pending suggestions count
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(and(eq(suggestions.operatorId, operatorId), eq(suggestions.status, 'pending')))
        .catch((err) => {
          this.logger.error(
            `Failed to fetch pending count: ${err instanceof Error ? err.message : err}`,
          );
          return [{ total: 0 }];
        }),

      // Approved today count
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.operatorId, operatorId),
            eq(suggestions.status, 'approved'),
            gte(suggestions.approvedAt, startOfToday),
          ),
        )
        .catch((err) => {
          this.logger.error(
            `Failed to fetch approved count: ${err instanceof Error ? err.message : err}`,
          );
          return [{ total: 0 }];
        }),

      // Declined today count
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.operatorId, operatorId),
            eq(suggestions.status, 'declined'),
            gte(suggestions.declinedAt, startOfToday),
          ),
        )
        .catch((err) => {
          this.logger.error(
            `Failed to fetch declined count: ${err instanceof Error ? err.message : err}`,
          );
          return [{ total: 0 }];
        }),

      // Expired today count
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.operatorId, operatorId),
            eq(suggestions.status, 'expired'),
            gte(suggestions.updatedAt, startOfToday),
          ),
        )
        .catch((err) => {
          this.logger.error(
            `Failed to fetch expired count: ${err instanceof Error ? err.message : err}`,
          );
          return [{ total: 0 }];
        }),

      // Acceptance rate: approved / (approved + declined) in last 30 days
      db
        .select({
          approved: sql<number>`count(*) filter (where ${suggestions.status} = 'approved' and ${suggestions.approvedAt} >= ${thirtyDaysAgo})::int`,
          declined: sql<number>`count(*) filter (where ${suggestions.status} = 'declined' and ${suggestions.declinedAt} >= ${thirtyDaysAgo})::int`,
        })
        .from(suggestions)
        .where(eq(suggestions.operatorId, operatorId))
        .catch((err) => {
          this.logger.error(
            `Failed to fetch acceptance rate: ${err instanceof Error ? err.message : err}`,
          );
          return [{ approved: 0, declined: 0 }];
        }),

      // Weekly flight hours
      this.getWeeklyFlightHours(operatorId).catch((err) => {
        this.logger.error(
          `Failed to fetch weekly flight hours: ${err instanceof Error ? err.message : err}`,
        );
        return [] as WeeklyFlightHour[];
      }),

      // Time to fill
      this.getTimeToFill(operatorId).catch((err) => {
        this.logger.error(
          `Failed to fetch time-to-fill: ${err instanceof Error ? err.message : err}`,
        );
        return null;
      }),

      // Queue health
      this.getQueueHealth(operatorId).catch((err) => {
        this.logger.error(
          `Failed to fetch queue health: ${err instanceof Error ? err.message : err}`,
        );
        return {
          pendingCount: 0,
          oldestPendingAge: 0,
          avgApprovalTime: 0,
          expirationRate: 0,
        } as QueueHealth;
      }),
    ]);

    const pending = pendingResult[0]?.total ?? 0;
    const approvedToday = approvedTodayResult[0]?.total ?? 0;
    const declinedToday = declinedTodayResult[0]?.total ?? 0;
    const expiredToday = expiredTodayResult[0]?.total ?? 0;

    const approved30d = acceptanceRateResult[0]?.approved ?? 0;
    const declined30d = acceptanceRateResult[0]?.declined ?? 0;
    const totalDecisions = approved30d + declined30d;

    const acceptanceRate =
      totalDecisions > 0 ? Math.round((approved30d / totalDecisions) * 10000) / 100 : null;

    return {
      pendingSuggestions: pending,
      approvedToday,
      declinedToday,
      expiredToday,
      acceptanceRate,
      weeklyFlightHours,
      timeToFill,
      queueHealth,
    };
  }

  /**
   * Get flight hours per day for the past 7 days from reservation_history.
   * Returns an array of { date, hours } sorted chronologically.
   */
  async getWeeklyFlightHours(operatorId: number): Promise<WeeklyFlightHour[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // include today = 7 days

    const result = await db
      .select({
        date: sql<string>`date(${reservationHistory.startTime})`,
        hours: sql<number>`coalesce(sum(extract(epoch from (${reservationHistory.endTime} - ${reservationHistory.startTime})) / 3600.0), 0)::float`,
      })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gte(reservationHistory.startTime, sevenDaysAgo),
          eq(reservationHistory.status, 'completed'),
        ),
      )
      .groupBy(sql`date(${reservationHistory.startTime})`)
      .orderBy(sql`date(${reservationHistory.startTime})`);

    // Fill in missing days with 0 hours
    const hoursMap = new Map<string, number>();
    for (const row of result) {
      hoursMap.set(row.date, Math.round(row.hours * 10) / 10);
    }

    const days: WeeklyFlightHour[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0]!;
      days.push({
        date: dateStr,
        hours: hoursMap.get(dateStr) ?? 0,
      });
    }

    return days;
  }

  /**
   * Average time (in hours) from suggestion creation to approval.
   * Only considers approved suggestions in the last 30 days.
   * Returns null if no approved suggestions exist.
   */
  async getTimeToFill(operatorId: number): Promise<number | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db
      .select({
        avgHours: sql<
          number | null
        >`avg(extract(epoch from (${suggestions.approvedAt} - ${suggestions.createdAt})) / 3600.0)::float`,
      })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'approved'),
          gte(suggestions.approvedAt, thirtyDaysAgo),
        ),
      );

    const avg = result[0]?.avgHours;
    if (avg === null || avg === undefined) return null;
    return Math.round(avg * 10) / 10;
  }

  /**
   * Queue health metrics:
   * - pendingCount: total pending suggestions
   * - oldestPendingAge: hours since oldest pending was created
   * - avgApprovalTime: average hours from creation to approval (30d)
   * - expirationRate: % of suggestions that expired vs total resolved (30d)
   */
  async getQueueHealth(operatorId: number): Promise<QueueHealth> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [countAndAge, expirationResult] = await Promise.all([
      // Pending count + oldest pending age
      db
        .select({
          pendingCount: sql<number>`count(*)::int`,
          oldestCreatedAt: sql<string | null>`min(${suggestions.createdAt})`,
        })
        .from(suggestions)
        .where(and(eq(suggestions.operatorId, operatorId), eq(suggestions.status, 'pending'))),

      // Expiration rate: expired / (approved + declined + expired) in last 30 days
      db
        .select({
          expired: sql<number>`count(*) filter (where ${suggestions.status} = 'expired')::int`,
          total: sql<number>`count(*) filter (where ${suggestions.status} in ('approved', 'declined', 'expired'))::int`,
        })
        .from(suggestions)
        .where(
          and(eq(suggestions.operatorId, operatorId), gte(suggestions.updatedAt, thirtyDaysAgo)),
        ),
    ]);

    const pendingCount = countAndAge[0]?.pendingCount ?? 0;
    const oldestCreatedAtStr = countAndAge[0]?.oldestCreatedAt;
    let oldestPendingAge = 0;
    if (oldestCreatedAtStr) {
      const oldestDate = new Date(oldestCreatedAtStr);
      oldestPendingAge =
        Math.round(((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60)) * 10) / 10;
    }

    const timeToFill = await this.getTimeToFill(operatorId);

    const expired30d = expirationResult[0]?.expired ?? 0;
    const total30d = expirationResult[0]?.total ?? 0;
    const expirationRate = total30d > 0 ? Math.round((expired30d / total30d) * 10000) / 100 : 0;

    return {
      pendingCount,
      oldestPendingAge,
      avgApprovalTime: timeToFill ?? 0,
      expirationRate,
    };
  }
}
