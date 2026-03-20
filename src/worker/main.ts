import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const logger = new Logger('Worker');

  logger.log('Worker starting...');
  logger.log(`Redis host: ${process.env.REDIS_HOST ?? 'localhost'}`);
  logger.log(`Redis port: ${process.env.REDIS_PORT ?? '6379'}`);

  // Create a standalone NestJS application (no HTTP server).
  // BullMQ processors are auto-registered via the @Processor decorator
  // when the module is initialized.
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Graceful shutdown
  app.enableShutdownHooks();

  logger.log('Worker ready. BullMQ processors registered:');
  logger.log('  - poll-schedule');
  logger.log('  - generate-suggestions');
  logger.log('  - expire-suggestions');
  logger.log('  - send-notification');
  logger.log('  - ai-enrich-suggestion');
}

bootstrap().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
