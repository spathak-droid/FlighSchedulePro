/**
 * Request logging & metrics interceptor.
 *
 * - Uses correlation ID from the CorrelationIdMiddleware (AsyncLocalStorage)
 * - Logs structured request/response info (method, path, status, duration)
 * - Records request duration in the metrics collector
 * - Tracks request count by endpoint, response time percentiles, error rate by status code
 * - Updates AsyncLocalStorage with operatorId once available from auth
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { metrics } from '../../../common/logger.js';
import {
  getCorrelationId,
  requestContext,
} from '../middleware/correlation-id.middleware.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method ?? request.raw?.method ?? 'UNKNOWN';
    const url = request.url ?? request.raw?.url ?? '/';

    // Get correlation ID from middleware (AsyncLocalStorage) or request
    const correlationId = request.correlationId ?? getCorrelationId();

    // Update AsyncLocalStorage with operatorId if available from auth
    const store = requestContext.getStore();
    if (store && request.user?.operatorId) {
      store.operatorId = request.user.operatorId;
    }

    const start = Date.now();
    const normalizedPath = this.normalizePath(url);

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

          // Metrics — request counts
          metrics.increment('http_requests_total', { method, status: String(statusCode) });

          // Metrics — per-endpoint request count
          metrics.increment('http_endpoint_requests_total', { method, path: normalizedPath });

          // Metrics — response time histogram
          metrics.observe('http_request_duration_ms', duration, { method, path: normalizedPath });

          // Metrics — status code family
          const statusFamily = `${Math.floor(statusCode / 100)}xx`;
          metrics.increment('http_status_family_total', { family: statusFamily });
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

          // Metrics — request counts
          metrics.increment('http_requests_total', { method, status: String(statusCode) });

          // Metrics — error rate by status code
          metrics.increment('http_errors_total', { method, status: String(statusCode) });

          // Metrics — per-endpoint error count
          metrics.increment('http_endpoint_errors_total', { method, path: normalizedPath, status: String(statusCode) });

          // Metrics — response time histogram (errors too)
          metrics.observe('http_request_duration_ms', duration, { method, path: normalizedPath });

          // Metrics — status code family
          const statusFamily = `${Math.floor(statusCode / 100)}xx`;
          metrics.increment('http_status_family_total', { family: statusFamily });
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
