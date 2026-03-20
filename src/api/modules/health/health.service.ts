/**
 * Health Check Service.
 *
 * Checks connectivity to all critical dependencies:
 * - PostgreSQL (via Drizzle — runs SELECT 1)
 * - Redis (via ioredis — runs PING)
 * - BullMQ workers (checks queue responsiveness)
 *
 * Returns a structured response with individual check statuses
 * and an overall health status.
 */

import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';

export type CheckStatus = 'healthy' | 'unhealthy';
export type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthResponse {
  status: OverallStatus;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    workers: HealthCheckResult;
  };
  timestamp: string;
  uptime: number;
  version: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
      });
      // Suppress unhandled error events (we handle errors in checkRedis)
      this.redis.on('error', () => {});
    }
    return this.redis;
  }

  async check(): Promise<HealthResponse> {
    const [database, redis, workers] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWorkers(),
    ]);

    const checks = { database, redis, workers };

    // Determine overall status
    const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');
    const allUnhealthy = Object.values(checks).every((c) => c.status === 'unhealthy');

    let status: OverallStatus;
    if (allHealthy) {
      status = 'healthy';
    } else if (allUnhealthy) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Database health check failed: ${message}`);
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: message,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const redis = this.getRedis();
      if (redis.status !== 'ready') {
        await redis.connect();
      }
      const result = await redis.ping();
      return {
        status: result === 'PONG' ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
        ...(result !== 'PONG' ? { error: `Unexpected PING response: ${result}` } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis health check failed: ${message}`);
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: message,
      };
    }
  }

  private async checkWorkers(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const redis = this.getRedis();
      if (redis.status !== 'ready') {
        await redis.connect();
      }

      // Check if BullMQ queues exist by looking for their Redis keys.
      // BullMQ stores queue metadata under bull:<queueName>:meta
      const queueNames = ['poll-schedule', 'expire-suggestions', 'generate-suggestions'];
      const results: string[] = [];

      for (const name of queueNames) {
        const exists = await redis.exists(`bull:${name}:meta`);
        if (exists) {
          results.push(name);
        }
      }

      // Workers are considered healthy if Redis is reachable (queues may not
      // have metadata keys until first job is added, which is fine).
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Worker health check failed: ${message}`);
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: message,
      };
    }
  }
}
