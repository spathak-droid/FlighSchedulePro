/**
 * Simple in-memory API rate limiter guard.
 *
 * Limits each IP + route combination to a configurable number of requests
 * per time window. Returns 429 Too Many Requests when exceeded.
 *
 * Note: This is an in-memory implementation suitable for single-instance
 * deployments. For multi-instance, replace with Redis-backed tracking.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Default: 100 requests per 60 seconds per IP. */
const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60_000;

/** Stricter limit for auth endpoints: 10 requests per 60 seconds. */
const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private readonly reflector: Reflector) {
    // Periodically clean up expired entries to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    // Allow garbage collection of the timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip: string = request.ip ?? request.headers?.['x-forwarded-for'] ?? 'unknown';
    const routePath: string = request.url ?? request.routeOptions?.url ?? '';

    // Use stricter limits for auth endpoints
    const isAuthRoute = routePath.includes('/auth/login') || routePath.includes('/auth/mfa');
    const limit = isAuthRoute ? AUTH_LIMIT : DEFAULT_LIMIT;
    const windowMs = isAuthRoute ? AUTH_WINDOW_MS : DEFAULT_WINDOW_MS;

    const key = `${ip}:${routePath}`;
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    entry.count++;

    if (entry.count > limit) {
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: `Too many requests. Limit: ${limit} per ${windowMs / 1000}s. Try again later.`,
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}
