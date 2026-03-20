import { pgTable, uuid, integer, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const flightAlerts = pgTable('flight_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(),
  reservationId: varchar('reservation_id', { length: 50 }),
  alertType: varchar('alert_type', { length: 30 }).notNull(), // 'overdue_return', 'safety', 'maintenance_due', 'weather_hold'
  severity: varchar('severity', { length: 10 }).notNull(), // 'info', 'warning', 'critical'
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  aircraftId: varchar('aircraft_id', { length: 50 }),
  instructorId: varchar('instructor_id', { length: 50 }),
  studentId: varchar('student_id', { length: 50 }),
  isResolved: boolean('is_resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: varchar('resolved_by', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_flight_alerts_active').on(table.operatorId, table.isResolved, table.createdAt),
]);
