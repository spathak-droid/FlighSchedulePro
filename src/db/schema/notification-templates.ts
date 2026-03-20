import { pgTable, uuid, integer, varchar, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(), // FK: operators(id) - enforced via migration
  type: varchar('type', { length: 30 }).notNull(),
  channel: varchar('channel', { length: 10 }).notNull(),
  subject: varchar('subject', { length: 255 }),
  bodyTemplate: text('body_template').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_notification_templates_operator_type_channel').on(table.operatorId, table.type, table.channel),
]);
