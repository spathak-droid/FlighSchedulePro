/**
 * BullMQ processor: expire-suggestions
 *
 * Runs periodically to expire stale suggestions:
 *   1. TTL-based: suggestions where expiresAt < now
 *   2. Slot-filled: suggestions where the proposed slot is now occupied
 *      by another reservation in FSP
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { db } from '../../db/index.js';
import { suggestions } from '../../db/schema/suggestions.js';
import { operators } from '../../db/schema/operators.js';
import { auditEvents } from '../../db/schema/audit-events.js';
import { eq, and, lt } from 'drizzle-orm';
import { FspScheduleService } from '../../api/fsp/fsp-schedule.service.js';
import { toFspLocalTime } from '../../core/utils/time.js';

// ─── Job Data ────────────────────────────────────────────────────────────────

export interface ExpireSuggestionsJobData {
  /** If provided, only process this operator. Otherwise process all. */
  operatorId?: number;
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor('expire-suggestions')
export class ExpireSuggestionsJob extends WorkerHost {
  private readonly logger = new Logger(ExpireSuggestionsJob.name);

  constructor(private readonly fspScheduleService: FspScheduleService) {
    super();
  }

  async process(job: Job<ExpireSuggestionsJobData>): Promise<void> {
    this.logger.log(`Expire-suggestions job started (jobId=${job.id})`);

    try {
      const now = new Date();

      // ── Phase 1: TTL-based expiration ────────────────────────────────────

      const ttlExpired = await this.expireByTtl(now);

      // ── Phase 2: Slot-filled expiration ──────────────────────────────────

      const slotFilled = await this.expireBySlotFilled(now, job.data.operatorId);

      this.logger.log(
        `Expire-suggestions completed: ${ttlExpired} TTL-expired, ${slotFilled} slot-filled`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Expire-suggestions failed: ${msg}`);
      throw error;
    }
  }

  // ── TTL Expiration ───────────────────────────────────────────────────────

  /**
   * Find all pending suggestions where expiresAt < now,
   * set status=expired with reason='ttl_exceeded',
   * and audit-log each expiration.
   */
  private async expireByTtl(now: Date): Promise<number> {
    // Batch update all TTL-expired suggestions
    const expired = await db
      .update(suggestions)
      .set({
        status: 'expired',
        expiredReason: 'ttl_exceeded',
        updatedAt: now,
      })
      .where(and(eq(suggestions.status, 'pending'), lt(suggestions.expiresAt, now)))
      .returning({ id: suggestions.id, operatorId: suggestions.operatorId });

    if (expired.length > 0) {
      this.logger.log(`Expired ${expired.length} suggestions due to TTL`);

      // Group by operator for efficient audit logging
      const byOperator = new Map<number, string[]>();
      for (const row of expired) {
        const ids = byOperator.get(row.operatorId) ?? [];
        ids.push(row.id);
        byOperator.set(row.operatorId, ids);
      }

      // Create one audit event per operator (batch)
      for (const [operatorId, ids] of byOperator) {
        await db.insert(auditEvents).values({
          operatorId,
          eventType: 'suggestion.expired',
          entityType: 'suggestion',
          data: {
            reason: 'ttl_exceeded',
            count: ids.length,
            suggestionIds: ids,
          },
        });
      }
    }

    return expired.length;
  }

  // ── Slot-Filled Expiration ───────────────────────────────────────────────

  /**
   * Check pending suggestions whose proposed time slot may now be filled
   * by a reservation in FSP. If the slot is occupied, expire with
   * reason='slot_filled'.
   */
  private async expireBySlotFilled(now: Date, specificOperatorId?: number): Promise<number> {
    // Get pending suggestions that haven't expired by TTL
    // but whose proposed time is in the near future (within 48 hours)
    // to avoid excessive FSP API calls for far-future suggestions.
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const pendingSuggestions = await db
      .select({
        id: suggestions.id,
        operatorId: suggestions.operatorId,
        locationId: suggestions.locationId,
        proposedStart: suggestions.proposedStart,
        proposedEnd: suggestions.proposedEnd,
      })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.status, 'pending'),
          lt(suggestions.proposedStart, cutoff),
          ...(specificOperatorId ? [eq(suggestions.operatorId, specificOperatorId)] : []),
        ),
      );

    if (pendingSuggestions.length === 0) return 0;

    // Group by operator to batch FSP calls
    const byOperator = new Map<
      number,
      Array<{
        id: string;
        locationId: string;
        proposedStart: Date;
        proposedEnd: Date;
      }>
    >();

    for (const s of pendingSuggestions) {
      const list = byOperator.get(s.operatorId) ?? [];
      list.push({
        id: s.id,
        locationId: s.locationId,
        proposedStart: s.proposedStart,
        proposedEnd: s.proposedEnd,
      });
      byOperator.set(s.operatorId, list);
    }

    let totalExpired = 0;

    for (const [operatorId, operatorSuggestions] of byOperator) {
      try {
        const expired = await this.checkSlotsFilled(operatorId, operatorSuggestions, now);
        totalExpired += expired;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Could not check slot-filled for operator ${operatorId}: ${msg}`);
      }
    }

    return totalExpired;
  }

  /**
   * For a specific operator, check if any pending suggestion slots are
   * now occupied in FSP.
   */
  private async checkSlotsFilled(
    operatorId: number,
    operatorSuggestions: Array<{
      id: string;
      locationId: string;
      proposedStart: Date;
      proposedEnd: Date;
    }>,
    now: Date,
  ): Promise<number> {
    // Get operator's FSP token
    const [op] = await db
      .select({ fspToken: operators.fspToken })
      .from(operators)
      .where(eq(operators.id, operatorId))
      .limit(1);

    if (!op?.fspToken) return 0;

    // Determine the time range to fetch: min start to max end of all suggestions
    let minStart = operatorSuggestions[0]!.proposedStart;
    let maxEnd = operatorSuggestions[0]!.proposedEnd;

    for (const s of operatorSuggestions) {
      if (s.proposedStart < minStart) minStart = s.proposedStart;
      if (s.proposedEnd > maxEnd) maxEnd = s.proposedEnd;
    }

    // Fetch current reservations from FSP for this time range
    const reservations = await this.fspScheduleService.getReservations(operatorId, op.fspToken, {
      dateRangeType: 3, // Custom range
      startRange: toFspLocalTime(minStart),
      endRange: toFspLocalTime(maxEnd),
    });

    const currentReservations = reservations.results ?? [];

    // For each suggestion, check if there's a reservation that overlaps its slot
    const expiredIds: string[] = [];

    for (const s of operatorSuggestions) {
      const isSlotFilled = currentReservations.some((res) => {
        const resStart = new Date(res.start);
        const resEnd = new Date(res.end);

        // Check for overlap: two intervals overlap if one starts before the other ends
        return resStart < s.proposedEnd && resEnd > s.proposedStart;
      });

      if (isSlotFilled) {
        expiredIds.push(s.id);
      }
    }

    if (expiredIds.length === 0) return 0;

    // Batch expire — continue on individual failures so one bad row doesn't block the rest
    let actualExpired = 0;
    for (const id of expiredIds) {
      try {
        await db
          .update(suggestions)
          .set({
            status: 'expired',
            expiredReason: 'slot_filled',
            updatedAt: now,
          })
          .where(
            and(
              eq(suggestions.id, id),
              eq(suggestions.status, 'pending'), // safety: only expire if still pending
            ),
          );
        actualExpired++;
      } catch (err) {
        this.logger.error(
          `Failed to expire suggestion ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Audit log — non-fatal
    try {
      await db.insert(auditEvents).values({
        operatorId,
        eventType: 'suggestion.expired',
        entityType: 'suggestion',
        data: {
          reason: 'slot_filled',
          count: actualExpired,
          suggestionIds: expiredIds,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record slot-filled expiration audit event: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.log(`Expired ${actualExpired} slot-filled suggestions for operator ${operatorId}`);

    return actualExpired;
  }
}
