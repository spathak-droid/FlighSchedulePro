import { Module } from '@nestjs/common';
import { WeatherModule } from '../weather/weather.module.js';
import { FspModule } from '../../fsp/fsp.module.js';
import { DisruptionDetectorService } from './disruption-detector.service.js';
import { DisruptionsController } from './disruptions.controller.js';

@Module({
  imports: [WeatherModule, FspModule],
  controllers: [DisruptionsController],
  providers: [DisruptionDetectorService],
  exports: [DisruptionDetectorService],
})
export class DisruptionsModule {}
