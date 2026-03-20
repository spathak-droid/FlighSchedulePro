import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { db } from '../../../db/index.js';
import { sql } from 'drizzle-orm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip tenant isolation for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // Set by AuthGuard

    if (!user?.operatorId) {
      throw new ForbiddenException('No operator context');
    }

    // Set PostgreSQL session variable for Row-Level Security (RLS).
    // All subsequent queries in this request will be scoped to this tenant.
    // Note: SET doesn't support parameterized queries, so we use sql.raw().
    // operatorId is an integer from our JWT — safe from injection.
    const tenantId = String(Number(user.operatorId));
    await db.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);

    return true;
  }
}
