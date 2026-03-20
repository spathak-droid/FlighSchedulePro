import { Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service.js';
import { FeatureFlagsController } from './feature-flags.controller.js';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
