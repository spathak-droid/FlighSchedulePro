import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public, skipping AuthGuard JWT verification.
 * Apply to controllers or individual route handlers that should be
 * accessible without authentication (e.g., login, health check).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
