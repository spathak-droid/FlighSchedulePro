import { Module } from '@nestjs/common';
import { StudentInsightsService } from './student-insights.service.js';
import { InsightsController } from './insights.controller.js';

@Module({
  controllers: [InsightsController],
  providers: [StudentInsightsService],
  exports: [StudentInsightsService],
})
export class InsightsModule {}
