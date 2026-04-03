import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { db } from '../../../db/index.js';
import { suggestions, reservationHistory, prospects } from '../../../db/schema/index.js';
import { eq, and, desc, asc, gte, lte, sql, SQL } from 'drizzle-orm';
import { FspScheduleService } from '../../fsp/fsp-schedule.service.js';
import { AuditService } from '../activity/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import type { FspCreateReservationRequest } from '../../fsp/fsp.types.js';
import type { SendNotificationJobData } from '../../../worker/jobs/send-notification.job.js';
import { toFspLocalTime } from '../../../core/utils/time.js';

/** Default page size for suggestion listings. */
const DEFAULT_PAGE_SIZE = 20;
/** Maximum page size for suggestion listings. */
const MAX_PAGE_SIZE = 100;
/** Maximum retry attempts for notification dispatch jobs. */
const NOTIFICATION_MAX_ATTEMPTS = 3;
/** Base delay (ms) for exponential backoff on notification retries. */
const NOTIFICATION_BACKOFF_DELAY_MS = 5000;

export interface ListSuggestionsParams {
  operatorId: number;
  status?: string;
  type?: string;
  locationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface ApproveSuggestionResult {
  suggestion: typeof suggestions.$inferSelect;
  reservation: { id?: string; errors?: Array<{ message: string; field?: string }> } | null;
}

export interface BulkResultItem {
  id: string;
  status: 'approved' | 'declined' | 'failed';
  fspReservationId?: string;
  error?: string;
}

export interface BulkResult {
  results: BulkResultItem[];
  summary: { approved?: number; declined?: number; failed: number };
}

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    private readonly fspScheduleService: FspScheduleService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    @InjectQueue('send-notification') private readonly notificationQueue: Queue,
  ) {}

  /**
   * List suggestions for an operator with filtering and pagination.
   * Default filter: status=pending, sorted by rankingScore desc then createdAt asc.
   */
  async list(params: ListSuggestionsParams) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [eq(suggestions.operatorId, params.operatorId)];

    // Only filter by status when explicitly provided (not empty / not 'all')
    if (params.status && params.status !== 'all') {
      conditions.push(eq(suggestions.status, params.status));
    }

    if (params.type) {
      conditions.push(eq(suggestions.type, params.type));
    }

    if (params.locationId) {
      conditions.push(eq(suggestions.locationId, params.locationId));
    }

    if (params.dateFrom) {
      conditions.push(gte(suggestions.proposedStart, params.dateFrom));
    }

    if (params.dateTo) {
      conditions.push(lte(suggestions.proposedStart, params.dateTo));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(suggestions)
        .where(whereClause)
        .orderBy(desc(suggestions.rankingScore), asc(suggestions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * Get a single suggestion by ID, scoped to the operator.
   * Throws NotFoundException if not found.
   */
  async getById(operatorId: number, id: string) {
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, id), eq(suggestions.operatorId, operatorId)))
      .limit(1);

    if (!suggestion) {
      throw new NotFoundException(`Suggestion ${id} not found`);
    }

    return suggestion;
  }

  /**
   * Approve a suggestion:
   * 1. Get suggestion, verify status=pending
   * 2. Set status=processing (optimistic lock)
   * 3. Build FSP reservation request from suggestion fields
   * 4. Call FspScheduleService.validateReservation() first
   * 5. If validation passes, call FspScheduleService.createReservation()
   * 6. On success: set status=approved, store fspReservationId, approvedBy, approvedAt
   * 7. On FSP error: set status back to pending, store fspValidationErrors
   * 8. Audit log the action
   * 9. Return { suggestion, reservation }
   */
  async approve(
    operatorId: number,
    id: string,
    userId: string,
    fspToken: string,
  ): Promise<ApproveSuggestionResult> {
    // Step 1: Get suggestion and verify status
    const suggestion = await this.getById(operatorId, id);

    if (suggestion.status !== 'pending') {
      throw new ConflictException(
        `Suggestion ${id} cannot be approved — current status is '${suggestion.status}'`,
      );
    }

    // Step 2: Set status=processing (optimistic lock to prevent double-approve)
    const [locked] = await db
      .update(suggestions)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(
        and(
          eq(suggestions.id, id),
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'pending'),
        ),
      )
      .returning();

    if (!locked) {
      throw new ConflictException(`Suggestion ${id} was modified concurrently — please retry`);
    }

    // Step 3: Build FSP reservation request from suggestion fields
    // IMPORTANT: FSP expects local time without timezone suffix
    const reservationParams: Omit<FspCreateReservationRequest, 'validateOnly'> = {
      operatorId,
      locationId: Number(suggestion.locationId),
      pilotId: suggestion.studentId ?? '',
      aircraftId: suggestion.aircraftId ?? '',
      instructorId: suggestion.instructorId ?? undefined,
      start: toFspLocalTime(suggestion.proposedStart),
      end: toFspLocalTime(suggestion.proposedEnd),
      ...(suggestion.activityTypeId && { reservationTypeId: suggestion.activityTypeId }),
      ...(suggestion.courseId &&
        suggestion.lessonId &&
        suggestion.enrollmentId &&
        suggestion.studentId && {
          trainingSessions: [
            {
              courseId: suggestion.courseId,
              lessonId: suggestion.lessonId,
              enrollmentId: suggestion.enrollmentId,
              studentId: suggestion.studentId,
            },
          ],
        }),
    };

    try {
      // Step 4: Validate first (validate-then-create pattern)
      this.logger.log(`Validating reservation for suggestion ${id}`);
      const validationResult = await this.fspScheduleService.validateReservation(
        operatorId,
        fspToken,
        reservationParams,
      );

      if (validationResult.errors && validationResult.errors.length > 0) {
        // Validation failed — revert to pending and store errors
        this.logger.warn(
          `FSP validation failed for suggestion ${id}: ${JSON.stringify(validationResult.errors)}`,
        );

        const [reverted] = await db
          .update(suggestions)
          .set({
            status: 'pending',
            fspValidationErrors: validationResult.errors,
            updatedAt: new Date(),
          })
          .where(eq(suggestions.id, id))
          .returning();

        await this.auditService.create({
          operatorId,
          eventType: 'suggestion_approve_failed',
          entityType: 'suggestion',
          entityId: id,
          actorId: userId,
          data: {
            reason: 'fsp_validation_failed',
            errors: validationResult.errors,
          },
        });

        return { suggestion: reverted!, reservation: validationResult };
      }

      // Step 5: Validation passed — create the reservation
      this.logger.log(`Creating FSP reservation for suggestion ${id}`);
      const createResult = await this.fspScheduleService.createReservation(
        operatorId,
        fspToken,
        reservationParams,
      );

      if (createResult.errors && createResult.errors.length > 0) {
        // Creation failed — revert to pending
        this.logger.warn(
          `FSP reservation creation failed for suggestion ${id}: ${JSON.stringify(createResult.errors)}`,
        );

        const [reverted] = await db
          .update(suggestions)
          .set({
            status: 'pending',
            fspValidationErrors: createResult.errors,
            updatedAt: new Date(),
          })
          .where(eq(suggestions.id, id))
          .returning();

        await this.auditService.create({
          operatorId,
          eventType: 'suggestion_approve_failed',
          entityType: 'suggestion',
          entityId: id,
          actorId: userId,
          data: {
            reason: 'fsp_creation_failed',
            errors: createResult.errors,
          },
        });

        return { suggestion: reverted!, reservation: createResult };
      }

      // Step 6: Success — update suggestion with approved status
      const now = new Date();
      const [approved] = await db
        .update(suggestions)
        .set({
          status: 'approved',
          fspReservationId: createResult.id ?? null,
          approvedBy: userId,
          approvedAt: now,
          fspValidationErrors: null,
          updatedAt: now,
        })
        .where(eq(suggestions.id, id))
        .returning();

      // Expire sibling suggestions in the same group (e.g. other discovery options)
      if (suggestion.groupId) {
        await db
          .update(suggestions)
          .set({ status: 'expired', expiredReason: 'slot_filled', updatedAt: now })
          .where(
            and(eq(suggestions.groupId, suggestion.groupId), eq(suggestions.status, 'pending')),
          );
      }

      // Step 8: Audit log
      await this.auditService.create({
        operatorId,
        eventType: 'suggestion_approved',
        entityType: 'suggestion',
        entityId: id,
        actorId: userId,
        data: {
          fspReservationId: createResult.id,
          type: suggestion.type,
          studentId: suggestion.studentId,
          proposedStart: suggestion.proposedStart.toISOString(),
          proposedEnd: suggestion.proposedEnd.toISOString(),
        },
      });

      // Create local reservation record
      try {
        await db.insert(reservationHistory).values({
          operatorId,
          studentId: suggestion.studentId ?? 'unknown',
          instructorId: suggestion.instructorId,
          aircraftId: suggestion.aircraftId,
          activityTypeId: suggestion.activityTypeId,
          locationId: suggestion.locationId,
          startTime: suggestion.proposedStart,
          endTime: suggestion.proposedEnd,
          status: 'completed',
        });
        this.logger.log(`Reservation history record created for suggestion ${id}`);
      } catch (rhError) {
        this.logger.warn(
          `Failed to create reservation history for suggestion ${id}: ${rhError instanceof Error ? rhError.message : rhError}`,
        );
      }

      // Update prospect status if discovery flight
      if (suggestion.prospectId) {
        try {
          await db
            .update(prospects)
            .set({ status: 'booked', updatedAt: new Date() })
            .where(eq(prospects.id, suggestion.prospectId));
          this.logger.log(`Prospect ${suggestion.prospectId} status updated to booked`);
        } catch (prospectError) {
          this.logger.warn(
            `Failed to update prospect status for suggestion ${id}: ${prospectError instanceof Error ? prospectError.message : prospectError}`,
          );
        }
      }

      // Send booking confirmation email
      try {
        await this.notificationService.sendBookingConfirmation(operatorId, suggestion);
      } catch (emailError) {
        this.logger.warn(
          `Failed to send booking confirmation email for suggestion ${id}: ${emailError instanceof Error ? emailError.message : emailError}`,
        );
      }

      // T088: Enqueue notification dispatch job
      try {
        const notificationData: SendNotificationJobData = {
          operatorId,
          suggestionId: id,
          approvedBy: userId,
          fspReservationId: createResult.id ?? undefined,
        };

        await this.notificationQueue.add(`notify-${id}-${Date.now()}`, notificationData, {
          attempts: NOTIFICATION_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: NOTIFICATION_BACKOFF_DELAY_MS },
        });

        this.logger.log(`Notification job enqueued for suggestion ${id}`);
      } catch (notifyError) {
        // Notification failure should not block the approval response
        this.logger.warn(
          `Failed to enqueue notification for suggestion ${id}: ${notifyError instanceof Error ? notifyError.message : notifyError}`,
        );
      }

      this.logger.log(`Suggestion ${id} approved — FSP reservation ${createResult.id}`);

      return { suggestion: approved!, reservation: createResult };
    } catch (error) {
      // Step 7: On unexpected FSP error, revert to pending
      this.logger.error(`Unexpected error approving suggestion ${id}: ${error}`);

      const errorMessage = error instanceof Error ? error.message : String(error);

      await db
        .update(suggestions)
        .set({
          status: 'pending',
          fspValidationErrors: [{ message: errorMessage }],
          updatedAt: new Date(),
        })
        .where(eq(suggestions.id, id));

      await this.auditService.create({
        operatorId,
        eventType: 'suggestion_approve_failed',
        entityType: 'suggestion',
        entityId: id,
        actorId: userId,
        data: {
          reason: 'unexpected_error',
          error: errorMessage,
        },
      });

      throw error;
    }
  }

  /**
   * Decline a suggestion.
   * Sets status=declined, declinedBy, declinedAt.
   * Throws ConflictException if status != pending.
   */
  async decline(operatorId: number, id: string, userId: string, reason?: string) {
    const suggestion = await this.getById(operatorId, id);

    if (suggestion.status !== 'pending') {
      throw new ConflictException(
        `Suggestion ${id} cannot be declined — current status is '${suggestion.status}'`,
      );
    }

    const now = new Date();
    const [declined] = await db
      .update(suggestions)
      .set({
        status: 'declined',
        declinedBy: userId,
        declinedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(suggestions.id, id),
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'pending'),
        ),
      )
      .returning();

    if (!declined) {
      throw new ConflictException(`Suggestion ${id} was modified concurrently — please retry`);
    }

    await this.auditService.create({
      operatorId,
      eventType: 'suggestion_declined',
      entityType: 'suggestion',
      entityId: id,
      actorId: userId,
      data: {
        reason: reason ?? null,
        type: suggestion.type,
        studentId: suggestion.studentId,
        proposedStart: suggestion.proposedStart.toISOString(),
        proposedEnd: suggestion.proposedEnd.toISOString(),
      },
    });

    // Send decline notification to the student
    try {
      await this.notificationService.sendDeclineNotification(operatorId, suggestion, reason);
    } catch (emailError) {
      this.logger.warn(
        `Failed to send decline notification for suggestion ${id}: ${emailError instanceof Error ? emailError.message : emailError}`,
      );
    }

    this.logger.log(`Suggestion ${id} declined by ${userId}`);

    return declined;
  }

  /**
   * Bulk approve multiple suggestions.
   * Processes each suggestion independently — one failure does not block others.
   */
  async bulkApprove(
    operatorId: number,
    ids: string[],
    userId: string,
    fspToken: string,
  ): Promise<BulkResult> {
    const results: BulkResultItem[] = [];
    let approved = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const result = await this.approve(operatorId, id, userId, fspToken);

        if (result.suggestion.status === 'approved') {
          results.push({
            id,
            status: 'approved',
            fspReservationId: result.suggestion.fspReservationId ?? undefined,
          });
          approved++;
        } else {
          // Validation/creation failed but didn't throw — suggestion reverted to pending
          results.push({
            id,
            status: 'failed',
            error:
              result.reservation?.errors?.map((e) => e.message).join('; ') ??
              'FSP validation or creation failed',
          });
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          id,
          status: 'failed',
          error: errorMessage,
        });
        failed++;
      }
    }

    return {
      results,
      summary: { approved, failed },
    };
  }

  /**
   * Bulk decline multiple suggestions.
   * Processes each suggestion independently.
   */
  async bulkDecline(
    operatorId: number,
    ids: string[],
    userId: string,
    reason?: string,
  ): Promise<BulkResult> {
    const results: BulkResultItem[] = [];
    let declined = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.decline(operatorId, id, userId, reason);
        results.push({ id, status: 'declined' });
        declined++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          id,
          status: 'failed',
          error: errorMessage,
        });
        failed++;
      }
    }

    return {
      results,
      summary: { declined, failed },
    };
  }

  /**
   * List suggestions that haven't been AI-enriched yet for a given operator.
   */
  async listForAiEnrich(operatorId: number): Promise<Array<{ id: string }>> {
    const rows = await db
      .select({ id: suggestions.id, rationale: suggestions.rationale })
      .from(suggestions)
      .where(eq(suggestions.operatorId, operatorId))
      .limit(200);

    // Filter to suggestions where rationale doesn't have aiEnriched=true
    return rows.filter((r) => {
      const rat = r.rationale as Record<string, unknown> | null;
      return !rat?.aiEnriched;
    });
  }
}
