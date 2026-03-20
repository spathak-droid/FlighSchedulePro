import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';
import { closeDbPool } from '../db/index.js';

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

  // Graceful shutdown — drain workers and close DB pool
  const shutdownGracefully = async (signal: string) => {
    logger.log(`Received ${signal} — starting graceful shutdown`);
    try {
      await app.close(); // triggers onModuleDestroy in JobScheduler (drains workers)
      await closeDbPool();
      logger.log('Worker graceful shutdown complete');
    } catch (err) {
      logger.error(
        `Error during worker shutdown: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdownGracefully('SIGTERM'));
  process.on('SIGINT', () => void shutdownGracefully('SIGINT'));

  // Catch unhandled promise rejections to prevent silent crashes
  process.on('unhandledRejection', (reason) => {
    logger.error(
      `Unhandled promise rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    );
  });

  logger.log('Worker ready. BullMQ processors registered:');
  logger.log('  - poll-schedule');
  logger.log('  - generate-suggestions');
  logger.log('  - expire-suggestions');
  logger.log('  - send-notification');
  logger.log('  - ai-enrich-suggestion');
}

bootstrap().catch((err) => {
  const logger = new Logger('Worker');
  logger.error(`Worker failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
