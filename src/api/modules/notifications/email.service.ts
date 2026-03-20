/**
 * Email service using Resend for transactional email delivery.
 *
 * Handles sending real emails via the Resend API with template rendering.
 * Falls back gracefully (logs warning) if RESEND_API_KEY is not configured.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly defaultFrom = 'FlightSchedule Pro <onboarding@resend.dev>';
  private readonly overrideRecipient: string | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.overrideRecipient = process.env.RESEND_EMAIL ?? null;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log(
        `Resend email service initialized` +
        (this.overrideRecipient ? ` (all emails → ${this.overrideRecipient})` : ''),
      );
    } else {
      this.resend = null;
      this.logger.warn(
        'RESEND_API_KEY not configured — emails will be logged but not sent',
      );
    }
  }

  /**
   * Send an email via Resend.
   * If the API key is not configured, logs the email and returns a mock success.
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const from = params.from ?? this.defaultFrom;

    if (!this.resend) {
      this.logger.warn(
        `[NO API KEY] Would send email to ${params.to}: "${params.subject}"`,
      );
      return {
        success: true,
        messageId: `mock-${Date.now()}`,
      };
    }

    try {
      // In dev mode, override recipient to RESEND_EMAIL so emails actually deliver
      const actualRecipient = this.overrideRecipient ?? params.to;
      this.logger.log(
        `Sending email to ${actualRecipient}${actualRecipient !== params.to ? ` (overriding ${params.to})` : ''}: "${params.subject}"`,
      );

      const { data, error } = await this.resend.emails.send({
        from,
        to: [actualRecipient],
        subject: params.subject,
        html: params.html,
      });

      if (error) {
        this.logger.error(`Resend API error: ${JSON.stringify(error)}`);
        return {
          success: false,
          error: error.message ?? JSON.stringify(error),
        };
      }

      this.logger.log(`Email sent successfully: ${data?.id}`);
      return {
        success: true,
        messageId: data?.id ?? undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email: ${msg}`);
      return {
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Render a template string by replacing {{variable}} placeholders with values.
   */
  renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.split(placeholder).join(value);
    }
    return rendered;
  }
}
