/**
 * Correlation ID middleware.
 *
 * Generates a unique request ID (UUID) for each incoming request and makes it
 * available throughout the request lifecycle via AsyncLocalStorage.
 *
 * - Reads existing `X-Request-Id` or `X-Correlation-Id` header, or generates a new UUID
 * - Attaches the ID to the request object (`request.correlationId`)
 * - Sets the `X-Request-Id` response header
 * - Stores it in AsyncLocalStorage so any code in the call chain can access it
 *   without needing the request object
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  correlationId: string;
  operatorId?: number;
}

/** Minimal request shape that works for both Fastify and Express adapters. */
interface MiddlewareRequest {
  headers?: Record<string, string | string[] | undefined>;
  correlationId?: string;
}

/** Minimal response shape that works for both Fastify and Express adapters. */
interface MiddlewareResponse {
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
}

/** Global AsyncLocalStorage instance for request-scoped context. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current correlation ID from AsyncLocalStorage, or 'no-context'
 * if called outside a request lifecycle.
 */
export function getCorrelationId(): string {
  return requestContext.getStore()?.correlationId ?? 'no-context';
}

/**
 * Returns the current operator ID from AsyncLocalStorage, if available.
 */
export function getOperatorId(): number | undefined {
  return requestContext.getStore()?.operatorId;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: MiddlewareRequest, res: MiddlewareResponse, next: () => void): void {
    const rawId = req.headers?.['x-request-id'] ?? req.headers?.['x-correlation-id'];
    const correlationId: string = typeof rawId === 'string' ? rawId : randomUUID();

    // Attach to request for interceptors/guards
    req.correlationId = correlationId;

    // Set response header
    if (typeof res.header === 'function') {
      // Fastify
      res.header('X-Request-Id', correlationId);
    } else if (typeof res.setHeader === 'function') {
      // Express fallback
      res.setHeader('X-Request-Id', correlationId);
    }

    // Run the rest of the request inside AsyncLocalStorage
    const context: RequestContext = { correlationId };
    requestContext.run(context, () => {
      next();
    });
  }
}
