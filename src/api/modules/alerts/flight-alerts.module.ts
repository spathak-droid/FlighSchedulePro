import { Module } from '@nestjs/common';
import { FlightAlertsService } from './flight-alerts.service.js';
import { FlightAlertsController } from './flight-alerts.controller.js';

@Module({
  controllers: [FlightAlertsController],
  providers: [FlightAlertsService],
  exports: [FlightAlertsService],
})
export class FlightAlertsModule {}
