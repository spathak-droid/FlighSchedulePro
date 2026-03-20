import { pgTable, uuid, integer, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// Note: No FK to operators — audit outlives data
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: integer('operator_id').notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }),
    entityId: uuid('entity_id'),
    actorId: varchar('actor_id', { length: 50 }),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_events_operator_time').on(table.operatorId, table.createdAt),
    index('idx_audit_events_operator_type_time').on(
      table.operatorId,
      table.eventType,
      table.createdAt,
    ),
  ],
);
