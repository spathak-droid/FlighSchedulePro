import { pgTable, uuid, integer, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const cancellationReasons = pgTable('cancellation_reasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_cancellation_reasons_operator').on(table.operatorId),
]);
