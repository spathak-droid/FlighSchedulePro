/**
 * T084: SMS provider interface and Twilio implementation.
 */

import { Injectable, Logger } from '@nestjs/common';
import Twilio from 'twilio';

// ─── Injection Token ────────────────────────────────────────────────────────

export const SMS_PROVIDER = 'SMS_PROVIDER';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface SmsProvider {
  send(to: string, message: string): Promise<SmsResult>;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Twilio Implementation ──────────────────────────────────────────────────

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly client: Twilio.Twilio | null;
  private readonly fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER ?? '';

    if (accountSid && authToken && this.fromNumber) {
      this.client = Twilio(accountSid, authToken);
      this.logger.log(`Twilio SMS initialized (from: ${this.fromNumber})`);
    } else {
      this.client = null;
      this.logger.warn(
        'Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER) — SMS will be logged only',
      );
    }
  }

  async send(to: string, message: string): Promise<SmsResult> {
    if (!this.client) {
      this.logger.log(
        `[SMS-LOG] to=${to}: ${message.substring(0, 120)}${message.length > 120 ? '...' : ''}`,
      );
      return {
        success: true,
        messageId: `log-${Date.now()}`,
      };
    }

    try {
      const msg = await this.client.messages.create({
        body: message,
        to,
        from: this.fromNumber,
      });

      this.logger.log(`SMS sent to ${to} (sid: ${msg.sid})`);
      return { success: true, messageId: msg.sid };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS to ${to} failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}

// ─── Null SMS Provider (for testing / SMS-disabled operators) ────────────────

@Injectable()
export class NullSmsProvider implements SmsProvider {
  private readonly logger = new Logger(NullSmsProvider.name);

  async send(to: string, _message: string): Promise<SmsResult> {
    this.logger.debug(`SMS disabled — suppressed message to ${to}`);
    return { success: true, messageId: `null-${Date.now()}` };
  }
}
