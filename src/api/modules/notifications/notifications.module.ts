/**
 * T082: Notification module.
 *
 * Provides notification dispatch, template management, and SMS delivery
 * for scheduling suggestions.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationService } from './notification.service.js';
import { EmailService } from './email.service.js';
import { TemplatesController } from './templates.controller.js';
import { TwilioSmsProvider, SMS_PROVIDER } from './sms-provider.interface.js';
import { ActivityModule } from '../activity/activity.module.js';

@Module({
  imports: [
    ActivityModule,
    BullModule.registerQueue({
      name: 'send-notification',
    }),
  ],
  controllers: [TemplatesController],
  providers: [
    NotificationService,
    EmailService,
    {
      provide: SMS_PROVIDER,
      useClass: TwilioSmsProvider,
    },
  ],
  exports: [NotificationService, EmailService],
})
export class NotificationsModule {}
