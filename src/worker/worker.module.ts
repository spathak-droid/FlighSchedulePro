/**
 * Minimal worker module — only registers JobScheduler to seed repeatable jobs
 * and UnifiedProcessor to handle all queues via manual Workers.
 *
 * Service module imports are kept minimal to avoid BullModule.registerQueue
 * in sub-modules creating extra Redis connections that hang with remote Redis.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JobScheduler } from './job-scheduler.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
          maxRetriesPerRequest: null,
        },
      }),
    }),

    BullModule.registerQueue({ name: 'poll-schedule' }, { name: 'expire-suggestions' }),
  ],
  providers: [JobScheduler],
})
export class WorkerModule {}
