/**
 * Structured logging configuration.
 *
 * Provides JSON-formatted log output with correlation IDs, timestamps,
 * and contextual metadata. In production, logs are structured JSON for
 * ingestion by centralized log aggregators (Azure Monitor, Datadog, etc.).
 * In development, logs remain human-readable via Fastify's default logger.
 *
 * Usage:
 *   import { createLogger } from './logger.js';
 *   const logger = createLogger('MyService');
 *   logger.info({ operatorId: 1001, event: 'sync_complete' }, 'Schedule sync finished');
 */

import { randomUUID } from 'crypto';

export interface LogContext {
  correlationId?: string;
  operatorId?: number;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Fastify logger options for structured JSON logging.
 * Used in main.ts when creating the Fastify adapter.
 *
 * Production: JSON output for log aggregators (Azure Monitor, Datadog, etc.)
 * Development: pino-pretty for human-readable output.
 */
export function getFastifyLoggerOptions(): Record<string, unknown> {
  const base: Record<string, unknown> = {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: () => randomUUID().slice(0, 8),
  };

  if (process.env.NODE_ENV !== 'production') {
    base.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    };
  }

  return base;
}

/**
 * Metrics collector — lightweight in-memory counters and histograms.
 * In production, these would be exported to Prometheus/StatsD/Azure Monitor.
 *
 * For now, exposes a /api/v1/health/metrics endpoint with JSON counters.
 */
class MetricsCollector {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    // Keep last 1000 observations
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
  }

  /** Snapshot of all metrics for the /health/metrics endpoint. */
  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, count] of this.counters) {
      result[key] = { type: 'counter', value: count };
    }

    for (const [key, values] of this.histograms) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      result[key] = {
        type: 'histogram',
        count: values.length,
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        max: sorted[sorted.length - 1],
      };
    }

    return result;
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

/** Global metrics instance. */
export const metrics = new MetricsCollector();
