import { pgTable, varchar, integer, decimal, timestamp, index } from 'drizzle-orm/pg-core';

export const students = pgTable(
  'students',
  {
    id: varchar('id', { length: 50 }).primaryKey(), // FSP student ID (e.g. 'stu-001')
    operatorId: integer('operator_id').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    locationId: varchar('location_id', { length: 50 }),
    totalFlightHours: decimal('total_flight_hours', { precision: 8, scale: 1 })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_students_operator').on(table.operatorId)],
);
