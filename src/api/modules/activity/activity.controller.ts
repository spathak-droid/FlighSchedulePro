import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

@Controller('activity')
export class ActivityController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/v1/activity
   * Returns audit events as a human-readable activity feed.
   * Query params: page, pageSize, dateFrom, dateTo
   */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const result = await this.auditService.list({
      operatorId: req.user.operatorId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    const feed = result.items.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      summary: this.buildSummary(
        event.eventType,
        event.actorId,
        event.data as Record<string, unknown>,
      ),
      actor: event.actorId,
      timestamp: event.createdAt.toISOString(),
      details: event.data as Record<string, unknown>,
    }));

    return {
      data: feed,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
      },
    };
  }

  /**
   * Build a human-readable summary for an audit event.
   */
  private buildSummary(
    eventType: string,
    actorId: string | null,
    data: Record<string, unknown>,
  ): string {
    const actor = actorId ?? 'System';

    switch (eventType) {
      case 'suggestion_approved':
        return (
          `${actor} approved a ${(data.type as string) ?? 'scheduling'} suggestion` +
          (data.fspReservationId ? ` (reservation ${data.fspReservationId})` : '')
        );

      case 'suggestion_declined':
        return (
          `${actor} declined a ${(data.type as string) ?? 'scheduling'} suggestion` +
          (data.reason ? ` — reason: ${data.reason}` : '')
        );

      case 'suggestion_approve_failed':
        return (
          `${actor} attempted to approve a suggestion but FSP validation failed` +
          (data.reason ? ` (${data.reason})` : '')
        );

      case 'suggestion_auto_approved':
        return (
          `Auto-approved ${(data.type as string) ?? ''} suggestion — ` +
          `risk: ${(data.riskLevel as string) ?? '?'}, ` +
          `all constraints passed`
        );

      case 'suggestion_auto_approve_blocked': {
        const failed = data.failedConstraints as string[] | undefined;
        const failCount = failed?.length ?? 0;
        return (
          `Auto-approve BLOCKED — ${failCount} constraint${failCount === 1 ? '' : 's'} failed` +
          (failed && failed.length > 0 ? `: ${failed[0]}` : '')
        );
      }

      case 'suggestion.expired': {
        const reason = data.reason as string | undefined;
        const count = data.count as number | undefined;
        return (
          `${count ?? 1} suggestion${(count ?? 1) === 1 ? '' : 's'} expired` +
          (reason === 'ttl_exceeded' ? ' (TTL exceeded)' :
           reason === 'slot_filled' ? ' (slot filled by another booking)' :
           reason === 'constraint_violation' ? ' (constraint no longer met)' : '')
        );
      }

      case 'suggestion_created':
        return `New suggestion created` + (data.type ? ` (type: ${data.type})` : '');

      case 'policy_changed':
      case 'policy_updated':
        return `${actor} updated scheduling policy`;

      case 'prospect_created':
        return `${actor} added a new discovery flight prospect`;

      case 'template_updated':
        return `${actor} updated a notification template`;

      case 'user_login':
        return `${actor} logged in`;

      case 'user_logout':
        return `${actor} logged out`;

      default: {
        // Derive a readable summary from the event type
        const readable = eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `${actor}: ${readable}`;
      }
    }
  }
}
