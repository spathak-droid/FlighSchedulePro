import { pgTable, varchar, integer, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const reservationHistory = pgTable('reservation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(),
  studentId: varchar('student_id', { length: 50 }).notNull(),
  instructorId: varchar('instructor_id', { length: 50 }),
  aircraftId: varchar('aircraft_id', { length: 50 }),
  activityTypeId: varchar('activity_type_id', { length: 50 }),
  locationId: varchar('location_id', { length: 50 }),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('completed'), // completed, cancelled, no_show
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_reservation_history_student').on(table.operatorId, table.studentId, table.endTime),
  index('idx_reservation_history_operator').on(table.operatorId, table.startTime),
]);
