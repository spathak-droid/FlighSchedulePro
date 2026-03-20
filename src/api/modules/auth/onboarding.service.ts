import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  operators,
  schedulingPolicies,
  notificationTemplates,
  syncState,
} from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';

/**
 * Default notification templates provisioned on first login.
 * 4 types x 2 channels = 8 templates.
 */
const DEFAULT_TEMPLATES: Array<{
  type: string;
  channel: string;
  subject: string | null;
  bodyTemplate: string;
}> = [
  // Waitlist — email
  {
    type: 'waitlist',
    channel: 'email',
    subject: 'A Flight Slot Has Opened Up For You',
    bodyTemplate:
      'Hi {{studentName}},\n\nA slot has opened up for {{activityType}} on {{proposedDate}} at {{proposedTime}} with {{instructorName}} in {{aircraftName}}.\n\nYour school scheduler has identified you as the best match for this opening. Please contact your school to confirm.\n\nSafe skies!',
  },
  // Waitlist — sms
  {
    type: 'waitlist',
    channel: 'sms',
    subject: null,
    bodyTemplate:
      '{{studentName}}: A slot opened for {{activityType}} on {{proposedDate}} at {{proposedTime}} with {{instructorName}}. Contact your school to confirm.',
  },
  // Reschedule — email
  {
    type: 'reschedule',
    channel: 'email',
    subject: 'Reschedule Options for Your Cancelled Flight',
    bodyTemplate:
      'Hi {{studentName}},\n\nYour {{activityType}} was cancelled. We found alternative times for you:\n\n{{proposedDate}} at {{proposedTime}} with {{instructorName}} in {{aircraftName}}\n\nPlease contact your school to confirm a new time.\n\nSafe skies!',
  },
  // Reschedule — sms
  {
    type: 'reschedule',
    channel: 'sms',
    subject: null,
    bodyTemplate:
      '{{studentName}}: Your {{activityType}} was cancelled. New option: {{proposedDate}} at {{proposedTime}} with {{instructorName}}. Contact your school.',
  },
  // Discovery — email
  {
    type: 'discovery',
    channel: 'email',
    subject: 'Your Discovery Flight is Confirmed!',
    bodyTemplate:
      'Hi {{studentName}},\n\nYour discovery flight has been confirmed for {{proposedDate}} at {{proposedTime}} with {{instructorName}} in {{aircraftName}}.\n\nPlease arrive 15 minutes early. We look forward to flying with you!\n\nSafe skies!',
  },
  // Discovery — sms
  {
    type: 'discovery',
    channel: 'sms',
    subject: null,
    bodyTemplate:
      '{{studentName}}: Your discovery flight is confirmed for {{proposedDate}} at {{proposedTime}}. Arrive 15 min early. See you there!',
  },
  // Next lesson — email
  {
    type: 'next_lesson',
    channel: 'email',
    subject: 'Your Next Flight Lesson is Scheduled',
    bodyTemplate:
      'Hi {{studentName}},\n\nYour next {{activityType}} lesson has been scheduled for {{proposedDate}} at {{proposedTime}} with {{instructorName}} in {{aircraftName}}.\n\nKeep up the great progress!\n\nSafe skies!',
  },
  // Next lesson — sms
  {
    type: 'next_lesson',
    channel: 'sms',
    subject: null,
    bodyTemplate:
      '{{studentName}}: Next lesson scheduled — {{activityType}} on {{proposedDate}} at {{proposedTime}} with {{instructorName}}.',
  },
];

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Check if an operator has already been onboarded.
   */
  async isOnboarded(operatorId: number): Promise<boolean> {
    const result = await db
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.id, operatorId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Provision all default records for a new operator on first login:
   * 1. Operator record
   * 2. Default scheduling policy (all column defaults)
   * 3. Default notification templates (4 types x 2 channels)
   * 4. Initial sync_state record
   * 5. Default feature flags
   */
  async onboardOperator(
    operatorId: number,
    operatorName: string,
  ): Promise<void> {
    const alreadyOnboarded = await this.isOnboarded(operatorId);
    if (alreadyOnboarded) {
      this.logger.log(
        `Operator ${operatorId} (${operatorName}) already onboarded — skipping`,
      );
      return;
    }

    this.logger.log(
      `Onboarding operator ${operatorId} (${operatorName})...`,
    );

    // 1. Insert operator record
    await db.insert(operators).values({
      id: operatorId,
      name: operatorName,
      status: 'active',
    });

    // 2. Insert default scheduling policy (relies on column defaults)
    await db.insert(schedulingPolicies).values({
      operatorId,
      waitlistWeights: {},
      notificationPreferences: {},
    });

    // 3. Insert default notification templates
    const templateRows = DEFAULT_TEMPLATES.map((tpl) => ({
      operatorId,
      type: tpl.type,
      channel: tpl.channel,
      subject: tpl.subject,
      bodyTemplate: tpl.bodyTemplate,
      isActive: true,
    }));

    await db.insert(notificationTemplates).values(templateRows);

    // 4. Insert initial sync_state record
    await db.insert(syncState).values({
      operatorId,
      syncErrors: [],
    });

    // 5. Seed default feature flags
    await this.featureFlagService.seedDefaultFlags(operatorId);

    this.logger.log(
      `Operator ${operatorId} (${operatorName}) onboarded successfully`,
    );
  }
}
