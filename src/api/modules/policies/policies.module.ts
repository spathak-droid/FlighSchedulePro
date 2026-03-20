import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service.js';
import { PoliciesController } from './policies.controller.js';

@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
