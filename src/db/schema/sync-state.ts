import { pgTable, uuid, integer, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const syncState = pgTable('sync_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull().unique(), // FK: operators(id) - enforced via migration
  lastScheduleHash: varchar('last_schedule_hash', { length: 64 }),
  lastScheduleSyncAt: timestamp('last_schedule_sync_at', { withTimezone: true }),
  lastResourceSyncAt: timestamp('last_resource_sync_at', { withTimezone: true }),
  lastStudentSyncAt: timestamp('last_student_sync_at', { withTimezone: true }),
  syncErrors: jsonb('sync_errors').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
