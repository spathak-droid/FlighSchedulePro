import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { ActivityController } from './activity.controller.js';

@Module({
  controllers: [ActivityController],
  providers: [AuditService],
  exports: [AuditService],
})
export class ActivityModule {}
