/**
 * Health Check Controller.
 *
 * Provides:
 * - GET /api/v1/health       — Full health check (DB, Redis, Workers)
 * - GET /api/v1/health/live  — Simple liveness probe (always 200 if process is running)
 * - GET /api/v1/health/metrics — Application metrics (request counts, latencies, memory)
 *
 * Returns 200 when healthy, 503 when degraded or unhealthy.
 */

import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';
import { metrics } from '../../../common/logger.js';
import type { FastifyReply } from 'fastify';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Full health check — verifies database, Redis, and worker connectivity.
   * Returns 503 if any component is unhealthy or degraded.
   */
  @Public()
  @Get()
  async check(@Res() reply: FastifyReply): Promise<void> {
    const result = await this.healthService.check();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    await reply.status(statusCode).send(result);
  }

  /**
   * Simple liveness probe — returns 200 if the process is running.
   * Use for Kubernetes/Railway liveness checks that only need to know
   * whether the process is alive (not whether dependencies are healthy).
   */
  @Public()
  @Get('live')
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Application metrics — request counts, latencies, error rates, memory usage.
   * Structured for consumption by monitoring/alerting systems.
   * Requires authentication to prevent information disclosure.
   */
  @Get('metrics')
  getMetrics() {
    const memUsage = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rssBytes: memUsage.rss,
        heapUsedBytes: memUsage.heapUsed,
        heapTotalBytes: memUsage.heapTotal,
        externalBytes: memUsage.external,
      },
      metrics: metrics.snapshot(),
    };
  }
}
