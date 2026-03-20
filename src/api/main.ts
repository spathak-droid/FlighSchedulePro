import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fallback to .env

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { getFastifyLoggerOptions } from '../common/logger.js';
import { closeDbPool } from '../db/index.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: getFastifyLoggerOptions() as unknown as boolean }),
  );

  // Enable NestJS shutdown hooks (OnModuleDestroy, etc.)
  app.enableShutdownHooks();

  app.setGlobalPrefix('api/v1');
  const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:3000'].filter(
    Boolean,
  ) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((o) => origin === o || origin === o.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Graceful shutdown — close DB pool after NestJS finishes its shutdown lifecycle
  const shutdownGracefully = async (signal: string) => {
    logger.log(`Received ${signal} — starting graceful shutdown`);
    try {
      await app.close();
      await closeDbPool();
      logger.log('Graceful shutdown complete');
    } catch (err) {
      logger.error(`Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
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

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`API running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error(`API failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
