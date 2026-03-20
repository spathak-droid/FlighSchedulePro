import { pgTable, uuid, integer, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const schedulingPolicies = pgTable('scheduling_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull().unique(), // FK: operators(id) - enforced via migration
  waitlistWeights: jsonb('waitlist_weights').notNull().default({}),
  rescheduleAlternativesCount: integer('reschedule_alternatives_count').notNull().default(5),
  searchWindowInitialDays: integer('search_window_initial_days').notNull().default(7),
  searchWindowIncrementDays: integer('search_window_increment_days').notNull().default(7),
  searchWindowMaxDays: integer('search_window_max_days').notNull().default(28),
  suggestionTtlHours: integer('suggestion_ttl_hours').notNull().default(24),
  pollingIntervalMinutes: integer('polling_interval_minutes').notNull().default(5),
  notificationPreferences: jsonb('notification_preferences').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
