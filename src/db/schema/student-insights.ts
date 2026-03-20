import {
  pgTable,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

export const studentInsights = pgTable(
  'student_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: integer('operator_id').notNull(),
    studentId: varchar('student_id', { length: 50 }).notNull(),
    studentName: varchar('student_name', { length: 200 }).notNull(),
    lastFlightDate: timestamp('last_flight_date', { withTimezone: true }),
    nextFlightDate: timestamp('next_flight_date', { withTimezone: true }),
    daysSinceLastFlight: integer('days_since_last_flight'),
    totalFlightHours: decimal('total_flight_hours', { precision: 8, scale: 1 })
      .notNull()
      .default('0'),
    enrollmentProgress: decimal('enrollment_progress', { precision: 5, scale: 2 }), // 0-100
    isInactive: boolean('is_inactive').notNull().default(false),
    isCheckrideReady: boolean('is_checkride_ready').notNull().default(false),
    isAtRisk: boolean('is_at_risk').notNull().default(false),
    riskReason: varchar('risk_reason', { length: 500 }),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_student_insights_inactive').on(table.operatorId, table.isInactive),
    index('idx_student_insights_checkride').on(table.operatorId, table.isCheckrideReady),
    index('idx_student_insights_operator').on(table.operatorId),
  ],
);
