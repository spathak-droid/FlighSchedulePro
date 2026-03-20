import { pgTable, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const activityTypes = pgTable(
  'activity_types',
  {
    id: varchar('id', { length: 50 }).primaryKey(), // FSP activity type ID (e.g. 'at-001')
    operatorId: integer('operator_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_activity_types_operator').on(table.operatorId)],
);
