import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const disruptionEvents = pgTable(
  'disruption_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: integer('operator_id').notNull(),
    type: varchar('type', { length: 20 }).notNull(), // 'weather', 'maintenance', 'instructor'
    severity: varchar('severity', { length: 20 }).notNull(), // 'warning', 'critical', 'grounded'
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    affectedReservationIds: jsonb('affected_reservation_ids').$type<string[]>().default([]),
    affectedStudentIds: jsonb('affected_student_ids').$type<string[]>().default([]),
    affectedAircraftIds: jsonb('affected_aircraft_ids').$type<string[]>().default([]),
    locationId: varchar('location_id', { length: 50 }),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_disruption_events_active').on(table.operatorId, table.isActive, table.detectedAt),
  ],
);
