/**
 * Structured Logger Service.
 *
 * Outputs structured JSON logs with contextual metadata:
 * - timestamp (ISO 8601)
 * - level (info, warn, error, debug)
 * - message
 * - correlationId (from AsyncLocalStorage)
 * - operatorId (from AsyncLocalStorage, if available)
 * - duration (optional, for timed operations)
 * - additional context fields
 *
 * In production, logs are JSON for ingestion by log aggregators.
 * In development, logs are human-readable via NestJS Logger.
 */

import { Injectable, Logger } from '@nestjs/common';
import { getCorrelationId, getOperatorId } from '../middleware/correlation-id.middleware.js';

export interface LogEntry {
  message: string;
  correlationId?: string;
  operatorId?: number;
  durationMs?: number;
  [key: string]: unknown;
}

@Injectable()
export class StructuredLoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('App');
  }

  /**
   * Create a child logger with a specific context name.
   */
  static forContext(context: string): StructuredLoggerService {
    const instance = new StructuredLoggerService();
    (instance as any).logger = new Logger(context);
    return instance;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.log(this.buildEntry(message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(this.buildEntry(message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(this.buildEntry(message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(this.buildEntry(message, meta));
  }

  /**
   * Time an async operation and log its duration.
   */
  async timed<T>(
    message: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.info(message, {
        ...meta,
        durationMs: Date.now() - start,
        success: true,
      });
      return result;
    } catch (err) {
      this.error(message, {
        ...meta,
        durationMs: Date.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private buildEntry(message: string, meta?: Record<string, unknown>): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      message,
      correlationId: getCorrelationId(),
      operatorId: getOperatorId(),
      ...meta,
    };
  }
}
