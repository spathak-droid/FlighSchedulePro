import { Global, Module } from '@nestjs/common';
import { FspClient } from './fsp.client.js';
import { FspAuthService } from './fsp-auth.service.js';
import { FspScheduleService } from './fsp-schedule.service.js';
import { FspResourceService } from './fsp-resource.service.js';
import { FspTrainingService } from './fsp-training.service.js';

@Global()
@Module({
  providers: [
    FspClient,
    FspAuthService,
    FspScheduleService,
    FspResourceService,
    FspTrainingService,
  ],
  exports: [
    FspClient,
    FspAuthService,
    FspScheduleService,
    FspResourceService,
    FspTrainingService,
  ],
})
export class FspModule {}
