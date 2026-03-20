/**
 * T083: Notification service.
 *
 * Handles notification dispatch, template rendering, and delivery tracking.
 *
 * Dispatch flow:
 * 1. Get operator's notification preferences
 * 2. Get notification template by type and channel
 * 3. Render template with variables
 * 4. For email: set sendEmailNotification=true on FSP reservation create (handled by approval flow)
 * 5. For SMS: call SMS provider if enabled and student opted in
 * 6. Create notification_record for tracking
 */

import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  notificationRecords,
  notificationTemplates,
  prospects,
  students,
  instructors,
  aircraft,
  activityTypes,
} from '../../../db/schema/index.js';
import { schedulingPolicies } from '../../../db/schema/scheduling-policies.js';
import { eq, and } from 'drizzle-orm';
import { AuditService } from '../activity/audit.service.js';
import { EmailService } from './email.service.js';
import { SMS_PROVIDER } from './sms-provider.interface.js';
import type { SmsProvider } from './sms-provider.interface.js';
import type {
  NotificationChannel,
  NotificationRecipientType,
  NotificationContent,
} from '../../../core/types/domain.js';

// ─── Dispatch Parameters ────────────────────────────────────────────────────

export interface NotificationDispatchParams {
  /** The type of notification: waitlist, reschedule, discovery, next_lesson. */
  notificationType: string;
  /** ID of the associated suggestion. */
  suggestionId?: string;
  /** Recipient type: student or prospect. */
  recipientType: NotificationRecipientType;
  /** FSP student ID or prospect DB ID. */
  recipientId: string;
  /** Phone number (for SMS). */
  recipientPhone?: string;
  /** Email (for email notifications — handled by FSP). */
  recipientEmail?: string;
  /** Template variables for rendering. */
  variables: Record<string, string>;
}

export interface NotificationDispatchResult {
  emailSent: boolean;
  smsSent: boolean;
  records: Array<{
    id: string;
    channel: NotificationChannel;
    deliveryStatus: string;
  }>;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Dispatch notifications for a given event.
   *
   * Checks operator preferences and sends via enabled channels.
   */
  async dispatch(
    operatorId: number,
    params: NotificationDispatchParams,
  ): Promise<NotificationDispatchResult> {
    this.logger.log(
      `Dispatching ${params.notificationType} notification for operator ${operatorId} ` +
        `to ${params.recipientType} ${params.recipientId}`,
    );

    const result: NotificationDispatchResult = {
      emailSent: false,
      smsSent: false,
      records: [],
    };

    // Get operator's notification preferences
    const [policy] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    const prefs = (policy?.notificationPreferences ?? {}) as Record<string, boolean>;
    const emailEnabled = prefs.emailEnabled !== false; // Default true
    const smsEnabled = prefs.smsEnabled === true; // Default false

    // ── Email notification ──────────────────────────────────────────────────
    // Email is handled by FSP via the sendEmailNotification flag on reservation
    // creation. We just record that it was requested.

    if (emailEnabled && params.recipientEmail) {
      try {
        const template = await this.getTemplate(operatorId, params.notificationType, 'email');
        const rendered = this.renderTemplate(
          template?.subject ?? '',
          template?.bodyTemplate ?? '',
          params.variables,
        );

        const [record] = await db
          .insert(notificationRecords)
          .values({
            operatorId,
            suggestionId: params.suggestionId ?? null,
            recipientType: params.recipientType,
            recipientId: params.recipientId,
            channel: 'email',
            templateId: template?.id ?? null,
            content: {
              subject: rendered.subject,
              body: rendered.body,
              templateId: template?.id,
              templateVars: params.variables,
            } satisfies NotificationContent,
            deliveryStatus: 'sent', // FSP handles actual delivery
          })
          .returning({ id: notificationRecords.id });

        result.emailSent = true;
        result.records.push({
          id: record!.id,
          channel: 'email',
          deliveryStatus: 'sent',
        });

        this.logger.log(
          `Email notification recorded for ${params.recipientType} ${params.recipientId}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Email notification failed: ${msg}`);

        await this.auditService.create({
          operatorId,
          eventType: 'notification.failed',
          entityType: 'notification',
          data: {
            channel: 'email',
            recipientId: params.recipientId,
            error: msg,
          },
        });
      }
    }

    // ── SMS notification ────────────────────────────────────────────────────

    if (smsEnabled && params.recipientPhone) {
      try {
        const template = await this.getTemplate(operatorId, params.notificationType, 'sms');
        const rendered = this.renderTemplate(
          '', // SMS has no subject
          template?.bodyTemplate ?? this.getDefaultSmsBody(params.notificationType),
          params.variables,
        );

        // Send via SMS provider
        const smsResult = await this.smsProvider.send(params.recipientPhone, rendered.body);

        const deliveryStatus = smsResult.success ? 'sent' : 'failed';

        const [record] = await db
          .insert(notificationRecords)
          .values({
            operatorId,
            suggestionId: params.suggestionId ?? null,
            recipientType: params.recipientType,
            recipientId: params.recipientId,
            channel: 'sms',
            templateId: template?.id ?? null,
            content: {
              body: rendered.body,
              templateId: template?.id,
              templateVars: params.variables,
            } satisfies NotificationContent,
            deliveryStatus,
            deliveryError: smsResult.error ?? null,
            sentAt: smsResult.success ? new Date() : null,
          })
          .returning({ id: notificationRecords.id });

        if (smsResult.success) {
          result.smsSent = true;
          result.records.push({
            id: record!.id,
            channel: 'sms',
            deliveryStatus: 'sent',
          });

          await this.auditService.create({
            operatorId,
            eventType: 'notification.sent',
            entityType: 'notification',
            entityId: record!.id,
            data: {
              channel: 'sms',
              recipientId: params.recipientId,
              messageId: smsResult.messageId,
            },
          });
        } else {
          result.records.push({
            id: record!.id,
            channel: 'sms',
            deliveryStatus: 'failed',
          });

          await this.auditService.create({
            operatorId,
            eventType: 'notification.failed',
            entityType: 'notification',
            entityId: record!.id,
            data: {
              channel: 'sms',
              recipientId: params.recipientId,
              error: smsResult.error,
            },
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`SMS notification failed: ${msg}`);

        await this.auditService.create({
          operatorId,
          eventType: 'notification.failed',
          entityType: 'notification',
          data: {
            channel: 'sms',
            recipientId: params.recipientId,
            error: msg,
          },
        });
      }
    }

    return result;
  }

  // ─── Template Management ──────────────────────────────────────────────────

  /**
   * Render a notification template by replacing {{placeholder}} variables.
   */
  renderTemplate(
    subject: string,
    body: string,
    variables: Record<string, string>,
  ): { subject: string; body: string } {
    let renderedSubject = subject;
    let renderedBody = body;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      renderedSubject = renderedSubject.split(placeholder).join(value);
      renderedBody = renderedBody.split(placeholder).join(value);
    }

    return { subject: renderedSubject, body: renderedBody };
  }

  /**
   * Get a notification template for a given type and channel.
   * Returns null if no template exists (caller should use defaults).
   */
  async getTemplate(operatorId: number, notificationType: string, channel: string) {
    const [template] = await db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.operatorId, operatorId),
          eq(notificationTemplates.type, notificationType),
          eq(notificationTemplates.channel, channel),
          eq(notificationTemplates.isActive, true),
        ),
      )
      .limit(1);

    return template ?? null;
  }

  /**
   * Get all templates for an operator.
   */
  async getTemplates(operatorId: number) {
    return db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.operatorId, operatorId))
      .orderBy(notificationTemplates.type, notificationTemplates.channel);
  }

  /**
   * Update a notification template's subject and body.
   */
  async updateTemplate(
    operatorId: number,
    templateId: string,
    data: { subject?: string; bodyTemplate?: string },
  ) {
    // Verify template belongs to this operator
    const [existing] = await db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.id, templateId),
          eq(notificationTemplates.operatorId, operatorId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    const [updated] = await db
      .update(notificationTemplates)
      .set({
        ...(data.subject !== undefined && { subject: data.subject }),
        ...(data.bodyTemplate !== undefined && { bodyTemplate: data.bodyTemplate }),
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, templateId))
      .returning();

    await this.auditService.create({
      operatorId,
      eventType: 'policy.updated',
      entityType: 'notification',
      entityId: templateId,
      data: {
        action: 'template_updated',
        type: existing.type,
        channel: existing.channel,
      },
    });

    return updated;
  }

  // ─── Booking Confirmation Email ──────────────────────────────────────────

  /**
   * Send a booking confirmation email after a suggestion is approved.
   * Loads recipient info, template, renders variables, sends via Resend,
   * and records the notification. Errors are logged but do not propagate
   * (booking should succeed even if email fails).
   */
  async sendBookingConfirmation(
    operatorId: number,
    suggestion: {
      id: string;
      type: string;
      prospectId?: string | null;
      studentId?: string | null;
      instructorId?: string | null;
      aircraftId?: string | null;
      activityTypeId?: string | null;
      proposedStart: Date;
      proposedEnd: Date;
    },
  ): Promise<void> {
    try {
      // Determine recipient
      let recipientEmail: string | undefined;
      let recipientName = 'Student';
      let recipientType: NotificationRecipientType = 'student';
      let recipientId: string;

      if (suggestion.prospectId) {
        recipientType = 'prospect';
        recipientId = suggestion.prospectId;
        const [prospect] = await db
          .select()
          .from(prospects)
          .where(eq(prospects.id, suggestion.prospectId))
          .limit(1);
        if (prospect) {
          recipientEmail = prospect.email ?? undefined;
          recipientName = `${prospect.firstName} ${prospect.lastName}`;
        }
      } else if (suggestion.studentId) {
        recipientType = 'student';
        recipientId = suggestion.studentId;
        const [student] = await db
          .select()
          .from(students)
          .where(eq(students.id, suggestion.studentId))
          .limit(1);
        if (student) {
          recipientEmail = student.email ?? undefined;
          recipientName = `${student.firstName} ${student.lastName}`;
        }
      } else {
        this.logger.warn(`Suggestion ${suggestion.id} has no student or prospect — skipping email`);
        return;
      }

      if (!recipientEmail) {
        this.logger.warn(`No email address for ${recipientType} ${recipientId!} — skipping email`);
        return;
      }

      // Resolve instructor name
      let instructorName = 'TBD';
      if (suggestion.instructorId) {
        const [inst] = await db
          .select()
          .from(instructors)
          .where(eq(instructors.id, suggestion.instructorId))
          .limit(1);
        if (inst) {
          instructorName = `${inst.firstName} ${inst.lastName}`;
        }
      }

      // Resolve aircraft name
      let aircraftName = 'TBD';
      if (suggestion.aircraftId) {
        const [craft] = await db
          .select()
          .from(aircraft)
          .where(eq(aircraft.id, suggestion.aircraftId))
          .limit(1);
        if (craft) {
          aircraftName = craft.registration;
          if (craft.makeModel) {
            aircraftName += ` (${craft.makeModel})`;
          }
        }
      }

      // Resolve activity type name
      let activityTypeName = 'Flight';
      if (suggestion.activityTypeId) {
        const [at] = await db
          .select()
          .from(activityTypes)
          .where(eq(activityTypes.id, suggestion.activityTypeId))
          .limit(1);
        if (at) {
          activityTypeName = at.name;
        }
      }

      // Build template variables
      const proposedDate = suggestion.proposedStart.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const proposedTime = suggestion.proposedStart.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const variables: Record<string, string> = {
        studentName: recipientName,
        proposedDate,
        proposedTime,
        instructorName,
        aircraftName,
        activityType: activityTypeName,
      };

      // Load template
      const template = await this.getTemplate(operatorId, suggestion.type, 'email');

      let subject: string;
      let body: string;

      if (template) {
        const rendered = this.renderTemplate(
          template.subject ?? 'Booking Confirmed',
          template.bodyTemplate,
          variables,
        );
        subject = rendered.subject;
        // Wrap plain-text template body in HTML email layout
        const htmlBody = rendered.body
          .split('\n')
          .map((line: string) =>
            line.trim()
              ? `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">${line}</p>`
              : '',
          )
          .join('\n');
        body = this.wrapInEmailLayout(htmlBody, variables);
      } else {
        subject = `Booking Confirmed — ${activityTypeName} on ${proposedDate}`;
        body = this.getDefaultEmailBody(suggestion.type, variables);
      }

      // Send via Resend
      const emailResult = await this.emailService.sendEmail({
        to: recipientEmail,
        subject,
        html: body,
      });

      // Record notification
      const deliveryStatus = emailResult.success ? 'sent' : 'failed';

      const [record] = await db
        .insert(notificationRecords)
        .values({
          operatorId,
          suggestionId: suggestion.id,
          recipientType,
          recipientId: recipientId!,
          channel: 'email',
          templateId: template?.id ?? null,
          content: {
            subject,
            body,
            templateId: template?.id,
            templateVars: variables,
          } satisfies NotificationContent,
          deliveryStatus,
          deliveryError: emailResult.error ?? null,
          sentAt: emailResult.success ? new Date() : null,
        })
        .returning({ id: notificationRecords.id });

      if (emailResult.success) {
        this.logger.log(
          `Booking confirmation email sent to ${recipientEmail} for suggestion ${suggestion.id}`,
        );
      } else {
        this.logger.warn(
          `Booking confirmation email failed for suggestion ${suggestion.id}: ${emailResult.error}`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send booking confirmation for suggestion ${suggestion.id}: ${msg}`,
      );
      // Don't rethrow — booking should succeed even if email fails
    }
  }

  /**
   * Wrap HTML content in the standard email layout (header + footer).
   */
  private wrapInEmailLayout(content: string, variables: Record<string, string>): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: #1e40af; padding: 24px 32px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">FlightSchedule Pro</h1>
        </div>
        <div style="padding: 32px;">
          ${content}
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${variables.proposedDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Time</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${variables.proposedTime}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Instructor</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${variables.instructorName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Aircraft</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${variables.aircraftName}</td></tr>
            </table>
          </div>
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
          This is an automated notification from FlightSchedule Pro. Please contact your flight school if you have any questions.
        </div>
      </div>
    `;
  }

  /**
   * Get a default HTML email body for a given notification type.
   */
  private getDefaultEmailBody(notificationType: string, variables: Record<string, string>): string {
    const v = variables;
    const wrapper = (content: string) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: #1e40af; padding: 24px 32px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">FlightSchedule Pro</h1>
        </div>
        <div style="padding: 32px;">
          ${content}
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
          This is an automated notification from FlightSchedule Pro. Please contact your flight school if you have any questions.
        </div>
      </div>
    `;

    switch (notificationType) {
      case 'discovery':
        return wrapper(`
          <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">Booking Confirmed!</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
            Hi ${v.studentName}, your discovery flight has been confirmed. Here are the details:
          </p>
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.proposedDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Time</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.proposedTime}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Instructor</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.instructorName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Aircraft</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.aircraftName}</td></tr>
            </table>
          </div>
          <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
            We look forward to seeing you! Please arrive 15 minutes early for your briefing.
          </p>
        `);
      default:
        return wrapper(`
          <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">Booking Confirmed!</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
            Hi ${v.studentName}, your ${v.activityType} has been confirmed.
          </p>
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.proposedDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Time</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.proposedTime}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Instructor</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.instructorName}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Aircraft</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${v.aircraftName}</td></tr>
            </table>
          </div>
          <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
            Contact your flight school if you need to make any changes.
          </p>
        `);
    }
  }

  // ─── Default Templates ────────────────────────────────────────────────────

  /**
   * Get a default SMS body for a notification type when no template is configured.
   */
  private getDefaultSmsBody(notificationType: string): string {
    switch (notificationType) {
      case 'waitlist':
        return 'Hi {{studentName}}, a slot has opened up on {{proposedTime}} with {{instructorName}} on {{aircraftName}}. Contact your flight school to confirm.';
      case 'reschedule':
        return 'Hi {{studentName}}, your cancelled {{activityType}} has been rescheduled to {{proposedTime}} with {{instructorName}}. Contact your flight school to confirm.';
      case 'discovery':
        return 'Hi {{studentName}}, your discovery flight has been scheduled for {{proposedTime}} with {{instructorName}} on {{aircraftName}}.';
      case 'next_lesson':
        return 'Hi {{studentName}}, your next lesson ({{activityType}}) is scheduled for {{proposedTime}} with {{instructorName}}.';
      default:
        return 'Hi {{studentName}}, you have a scheduling update. Contact your flight school for details.';
    }
  }
}
