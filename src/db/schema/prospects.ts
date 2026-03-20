import { pgTable, uuid, integer, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const prospects = pgTable('prospects', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(), // FK: operators(id) - enforced via migration
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  preferredDates: jsonb('preferred_dates'),
  notes: text('notes'),
  fspReservationId: varchar('fsp_reservation_id', { length: 50 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, booked, cancelled
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
