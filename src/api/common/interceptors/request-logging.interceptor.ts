/**
 * Request logging & metrics interceptor.
 *
 * - Assigns a correlation ID (from x-correlation-id header or auto-generated)
 * - Logs structured request/response info (method, path, status, duration)
 * - Records request duration in the metrics collector
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';
import { metrics } from '../../../common/logger.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method ?? request.raw?.method ?? 'UNKNOWN';
    const url = request.url ?? request.raw?.url ?? '/';

    // Correlation ID — use incoming header or generate
    const correlationId =
      request.headers?.['x-correlation-id'] ??
      request.headers?.['x-request-id'] ??
      randomUUID().slice(0, 8);

    // Attach to request for downstream use
    request.correlationId = correlationId;

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode ?? response.raw?.statusCode ?? 200;

          // Structured log
          this.logger.log({
            correlationId,
            method,
            url,
            statusCode,
            durationMs: duration,
            operatorId: request.user?.operatorId,
          });

          // Metrics
          metrics.increment('http_requests_total', { method, status: String(statusCode) });
          metrics.observe('http_request_duration_ms', duration, { method, path: this.normalizePath(url) });
        },
        error: (err) => {
          const duration = Date.now() - start;
          const statusCode = err?.status ?? err?.statusCode ?? 500;

          this.logger.warn({
            correlationId,
            method,
            url,
            statusCode,
            durationMs: duration,
            error: err?.message,
            operatorId: request.user?.operatorId,
          });

          metrics.increment('http_requests_total', { method, status: String(statusCode) });
          metrics.increment('http_errors_total', { method, status: String(statusCode) });
          metrics.observe('http_request_duration_ms', duration, { method, path: this.normalizePath(url) });
        },
      }),
    );
  }

  /** Normalize URLs to avoid high-cardinality metric labels (replace UUIDs/IDs). */
  private normalizePath(url: string): string {
    return url
      .split('?')[0]! // Remove query params
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id') // UUIDs
      .replace(/\/\d+/g, '/:id'); // Numeric IDs
  }
}
