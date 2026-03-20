import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { db } from '../../../db/index.js';
import { auditEvents } from '../../../db/schema/index.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method as string;

    // Only audit mutations
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const user = request.user as { operatorId?: number; userId?: string } | undefined;
        if (!user?.operatorId) return;

        const url = request.url as string;
        const eventType = this.deriveEventType(method, url);

        try {
          await db.insert(auditEvents).values({
            operatorId: user.operatorId,
            eventType,
            actorId: user.userId,
            data: {
              method,
              url,
              statusCode: context.switchToHttp().getResponse().statusCode as number,
              duration: Date.now() - startTime,
              body: this.sanitizeBody(request.body),
            },
          });
        } catch (err) {
          // Don't fail the request if audit logging fails
          this.logger.error(
            `Audit logging failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }

  private deriveEventType(method: string, url: string): string {
    if (url.includes('/suggestions') && url.includes('/approve')) return 'suggestion_approved';
    if (url.includes('/suggestions') && url.includes('/decline')) return 'suggestion_declined';
    if (url.includes('/suggestions')) return 'suggestion_created';
    if (url.includes('/policies')) return 'policy_changed';
    if (url.includes('/discovery')) return 'prospect_created';
    if (url.includes('/templates')) return 'template_updated';
    if (url.includes('/auth/login')) return 'user_login';
    if (url.includes('/auth/logout')) return 'user_logout';
    return `${method.toLowerCase()}_${url.split('/').pop() ?? 'unknown'}`;
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...(body as Record<string, unknown>) };
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.mfaCode;
    return sanitized;
  }
}
