import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SuggestionsService } from './suggestions.service.js';
import { SuggestionsController } from './suggestions.controller.js';
import { AutoApproveService } from './auto-approve.service.js';
import { MockTriggerService } from './mock-trigger.service.js';
import { ActivityModule } from '../activity/activity.module.js';
import { AiModule } from '../ai/ai.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [
    ActivityModule,
    AiModule,
    FeatureFlagsModule,
    NotificationsModule,
    BullModule.registerQueue(
      { name: 'send-notification' },
      { name: 'ai-enrich-suggestion' },
    ),
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionsService, AutoApproveService, MockTriggerService],
  exports: [SuggestionsService, AutoApproveService],
})
export class SuggestionsModule {}
