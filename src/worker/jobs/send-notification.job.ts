/**
 * T085: BullMQ processor for notification dispatch.
 *
 * Triggered when a suggestion is approved. Handles:
 * 1. Get suggestion details
 * 2. Get student/prospect contact info
 * 3. Render notification templates
 * 4. Dispatch via email (FSP handles) + SMS (if enabled)
 * 5. Create notification records
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { db } from '../../db/index.js';
import { suggestions } from '../../db/schema/suggestions.js';
import { prospects } from '../../db/schema/prospects.js';
import { operators } from '../../db/schema/operators.js';
import { eq } from 'drizzle-orm';
import { NotificationService } from '../../api/modules/notifications/notification.service.js';
import { FspTrainingService } from '../../api/fsp/fsp-training.service.js';
import { FspResourceService } from '../../api/fsp/fsp-resource.service.js';
import type { NotificationRecipientType } from '../../core/types/domain.js';

// ─── Job Data ───────────────────────────────────────────────────────────────

export interface SendNotificationJobData {
  /** Operator ID. */
  operatorId: number;
  /** Suggestion ID that was approved. */
  suggestionId: string;
  /** ID of the user who approved the suggestion. */
  approvedBy: string;
  /** FSP reservation ID (if created). */
  fspReservationId?: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor('send-notification')
export class SendNotificationJob extends WorkerHost {
  private readonly logger = new Logger(SendNotificationJob.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly fspTrainingService: FspTrainingService,
    private readonly fspResourceService: FspResourceService,
  ) {
    super();
  }

  async process(job: Job<SendNotificationJobData>): Promise<void> {
    const { operatorId, suggestionId, approvedBy, fspReservationId } = job.data;

    this.logger.log(
      `Send-notification job started for suggestion ${suggestionId} (operator ${operatorId})`,
    );

    try {
      // Step 1: Get suggestion details
      const [suggestion] = await db
        .select()
        .from(suggestions)
        .where(eq(suggestions.id, suggestionId))
        .limit(1);

      if (!suggestion) {
        this.logger.warn(`Suggestion ${suggestionId} not found — skipping notification`);
        return;
      }

      // Step 2: Determine recipient type and get contact info
      let recipientType: NotificationRecipientType;
      let recipientId: string;
      let recipientPhone: string | undefined;
      let recipientEmail: string | undefined;
      let studentName: string;

      if (suggestion.prospectId) {
        // Discovery flight — recipient is a prospect
        recipientType = 'prospect';
        recipientId = suggestion.prospectId;

        const [prospect] = await db
          .select()
          .from(prospects)
          .where(eq(prospects.id, suggestion.prospectId))
          .limit(1);

        if (prospect) {
          studentName = `${prospect.firstName} ${prospect.lastName}`;
          recipientPhone = prospect.phone ?? undefined;
          recipientEmail = prospect.email ?? undefined;
        } else {
          studentName = 'Prospect';
        }
      } else if (suggestion.studentId) {
        // Student reservation (waitlist, reschedule, next_lesson)
        recipientType = 'student';
        recipientId = suggestion.studentId;

        // Try to get student details from FSP
        const [op] = await db
          .select({ fspToken: operators.fspToken })
          .from(operators)
          .where(eq(operators.id, operatorId))
          .limit(1);

        if (op?.fspToken) {
          try {
            const fspStudents = await this.fspTrainingService.getStudents(operatorId, op.fspToken);
            const student = fspStudents.find((s) => s.id === suggestion.studentId);
            if (student) {
              studentName = student.fullName ?? `${student.firstName} ${student.lastName}`;
              recipientEmail = student.email ?? undefined;
            } else {
              studentName = suggestion.studentId;
            }
          } catch {
            studentName = suggestion.studentId;
          }
        } else {
          studentName = suggestion.studentId;
        }
      } else {
        this.logger.warn(
          `Suggestion ${suggestionId} has no student or prospect — skipping notification`,
        );
        return;
      }

      // Step 3: Build template variables
      const proposedTime = formatDateTime(suggestion.proposedStart);
      const instructorName = await this.resolveInstructorName(operatorId, suggestion.instructorId);
      const aircraftName = await this.resolveAircraftName(operatorId, suggestion.aircraftId);

      const variables: Record<string, string> = {
        studentName,
        proposedTime,
        proposedDate: formatDate(suggestion.proposedStart),
        proposedStartTime: formatTime(suggestion.proposedStart),
        proposedEndTime: formatTime(suggestion.proposedEnd),
        instructorName: instructorName ?? 'TBD',
        aircraftName: aircraftName ?? 'TBD',
        activityType: suggestion.activityTypeId ?? 'Flight',
        reservationId: fspReservationId ?? '',
      };

      // Step 4: Dispatch notification
      const result = await this.notificationService.dispatch(operatorId, {
        notificationType: suggestion.type,
        suggestionId: suggestion.id,
        recipientType,
        recipientId,
        recipientPhone,
        recipientEmail,
        variables,
      });

      this.logger.log(
        `Notification dispatched for suggestion ${suggestionId}: ` +
          `email=${result?.emailSent ?? false}, sms=${result?.smsSent ?? false}, ` +
          `records=${result?.records?.length ?? 0}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Send-notification job failed for suggestion ${suggestionId}: ${msg}`);
      throw error;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolve an instructor ID to a display name.
   */
  private async resolveInstructorName(
    operatorId: number,
    instructorId: string | null,
  ): Promise<string | null> {
    if (!instructorId) return null;

    try {
      const [op] = await db
        .select({ fspToken: operators.fspToken })
        .from(operators)
        .where(eq(operators.id, operatorId))
        .limit(1);

      if (!op?.fspToken) return instructorId;

      const instructors = await this.fspResourceService.getInstructors(operatorId, op.fspToken);
      const instructor = instructors.find((i) => i.id === instructorId);
      return instructor ? instructor.fullName : instructorId;
    } catch {
      return instructorId;
    }
  }

  /**
   * Resolve an aircraft ID to a display name (registration).
   */
  private async resolveAircraftName(
    operatorId: number,
    aircraftId: string | null,
  ): Promise<string | null> {
    if (!aircraftId) return null;

    try {
      const [op] = await db
        .select({ fspToken: operators.fspToken })
        .from(operators)
        .where(eq(operators.id, operatorId))
        .limit(1);

      if (!op?.fspToken) return aircraftId;

      const aircraft = await this.fspResourceService.getAircraft(operatorId, op.fspToken);
      const craft = aircraft.find((a) => a.id === aircraftId);
      return craft ? `${craft.registration} (${craft.makeModel})` : aircraftId;
    } catch {
      return aircraftId;
    }
  }
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
