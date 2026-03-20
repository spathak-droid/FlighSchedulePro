import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { metrics } from '../../../common/logger.js';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * GET /api/v1/health/metrics
   * Exposes application metrics (request counts, latencies, etc.)
   * for monitoring/alerting systems.
   */
  @Public()
  @Get('metrics')
  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      metrics: metrics.snapshot(),
    };
  }
}
