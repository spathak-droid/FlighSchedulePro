import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const operators = pgTable('operators', {
  id: integer('id').primaryKey(), // FSP operatorId
  name: varchar('name', { length: 255 }).notNull(),
  fspToken: text('fsp_token'), // encrypted at rest
  fspTokenExpiresAt: timestamp('fsp_token_expires_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, suspended, offboarding
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
