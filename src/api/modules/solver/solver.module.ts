/**
 * Solver Module — schedule solver and reservation management.
 *
 * Provides:
 * - ScheduleSolverService: constraint-satisfaction solver for finding time slots,
 *   optimizing daily schedules, and batch-creating reservations.
 * - ReservationsController: REST endpoints for solver operations and reservation CRUD.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleSolverService } from './schedule-solver.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ResourceLookupModule } from '../resources/resource-lookup.module.js';
import { WeatherModule } from '../weather/weather.module.js';

@Module({
  imports: [
    ResourceLookupModule,
    WeatherModule,
    BullModule.registerQueue({ name: 'generate-suggestions' }),
  ],
  controllers: [ReservationsController],
  providers: [ScheduleSolverService],
  exports: [ScheduleSolverService],
})
export class SolverModule {}
