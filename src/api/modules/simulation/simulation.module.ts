import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SimulationService } from './simulation.service.js';
import { SimulationController } from './simulation.controller.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'ai-enrich-suggestion' }),
  ],
  controllers: [SimulationController],
  providers: [SimulationService],
})
export class SimulationModule {}
