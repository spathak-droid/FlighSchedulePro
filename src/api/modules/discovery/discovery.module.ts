/**
 * T078: Discovery Flight module.
 *
 * Provides the API for creating prospect records and generating
 * daylight-only discovery flight suggestions.
 */

import { Module } from '@nestjs/common';
import { DiscoveryService } from './discovery.service.js';
import { DiscoveryController } from './discovery.controller.js';
import { ActivityModule } from '../activity/activity.module.js';
import { SolverModule } from '../solver/solver.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ActivityModule, SolverModule, NotificationsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
