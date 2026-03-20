import { pgTable, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const aircraft = pgTable(
  'aircraft',
  {
    id: varchar('id', { length: 50 }).primaryKey(), // FSP aircraft ID (e.g. 'ac-001')
    operatorId: integer('operator_id').notNull(),
    registration: varchar('registration', { length: 20 }).notNull(), // N-number (e.g. 'N172SP')
    makeModel: varchar('make_model', { length: 100 }),
    isSimulator: boolean('is_simulator').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_aircraft_operator').on(table.operatorId)],
);
