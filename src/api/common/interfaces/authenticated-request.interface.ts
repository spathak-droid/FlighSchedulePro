/**
 * Shared interface for authenticated Fastify requests.
 *
 * The AuthGuard populates `request.user` after JWT verification.
 * All controllers should import this instead of defining their own.
 */
export interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}
