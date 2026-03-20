import { pgTable, uuid, integer, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const notificationRecords = pgTable('notification_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(), // FK: operators(id) - enforced via migration
  suggestionId: uuid('suggestion_id'), // FK: suggestions(id) - enforced via migration
  recipientType: varchar('recipient_type', { length: 20 }).notNull(), // student, prospect
  recipientId: varchar('recipient_id', { length: 50 }).notNull(),
  channel: varchar('channel', { length: 10 }).notNull(), // email, sms
  templateId: varchar('template_id', { length: 50 }),
  content: jsonb('content').notNull(),
  deliveryStatus: varchar('delivery_status', { length: 20 }).notNull().default('pending'),
  deliveryError: text('delivery_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
