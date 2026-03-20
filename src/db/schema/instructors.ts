import { pgTable, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const instructors = pgTable(
  'instructors',
  {
    id: varchar('id', { length: 50 }).primaryKey(), // FSP instructor ID (e.g. 'inst-001')
    operatorId: integer('operator_id').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    instructorType: varchar('instructor_type', { length: 20 }), // CFI, CFII, etc.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_instructors_operator').on(table.operatorId)],
);
