import { Module } from '@nestjs/common';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { AiModule } from '../ai/ai.module.js';

@Module({
  imports: [AiModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
