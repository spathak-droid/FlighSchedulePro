import { Injectable } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { auditEvents } from '../../../db/schema/index.js';
import { desc, eq, and, gte, lte, notInArray, SQL } from 'drizzle-orm';

export interface CreateAuditEventParams {
  operatorId: number;
  eventType: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  data: Record<string, unknown>;
}

export interface ListAuditEventsParams {
  operatorId: number;
  page?: number;
  pageSize?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class AuditService {
  async create(params: CreateAuditEventParams) {
    const [event] = await db
      .insert(auditEvents)
      .values({
        operatorId: params.operatorId,
        eventType: params.eventType,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        actorId: params.actorId ?? null,
        data: params.data,
      })
      .returning();

    return event;
  }

  async list(params: ListAuditEventsParams) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;

    // Exclude noisy system events from the activity feed
    const excludedTypes = [
      'sync.started',
      'sync.completed',
      'sync.failed',
      'post_scan',
      'post_resolve',
      'post_refresh',
    ];

    const conditions: SQL[] = [
      eq(auditEvents.operatorId, params.operatorId),
      notInArray(auditEvents.eventType, excludedTypes),
    ];

    if (params.dateFrom) {
      conditions.push(gte(auditEvents.createdAt, params.dateFrom));
    }
    if (params.dateTo) {
      conditions.push(lte(auditEvents.createdAt, params.dateTo));
    }

    const whereClause = and(...conditions);

    const items = await db
      .select()
      .from(auditEvents)
      .where(whereClause)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items,
      page,
      pageSize,
    };
  }
}
