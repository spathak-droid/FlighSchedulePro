import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  timestamp,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const suggestions = pgTable(
  'suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: integer('operator_id').notNull(), // FK: operators(id) - enforced via migration
    type: varchar('type', { length: 30 }).notNull(), // waitlist, reschedule, discovery, next_lesson
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, approved, declined, expired, processing
    locationId: varchar('location_id', { length: 50 }).notNull(),
    studentId: varchar('student_id', { length: 50 }),
    prospectId: uuid('prospect_id'), // FK: prospects(id) - enforced via migration
    instructorId: varchar('instructor_id', { length: 50 }),
    aircraftId: varchar('aircraft_id', { length: 50 }),
    proposedStart: timestamp('proposed_start', { withTimezone: true }).notNull(),
    proposedEnd: timestamp('proposed_end', { withTimezone: true }).notNull(),
    activityTypeId: varchar('activity_type_id', { length: 50 }),
    courseId: varchar('course_id', { length: 50 }),
    lessonId: varchar('lesson_id', { length: 50 }),
    enrollmentId: varchar('enrollment_id', { length: 50 }),
    rankingScore: decimal('ranking_score', { precision: 10, scale: 4 }),
    rationale: jsonb('rationale').notNull(),
    groupId: uuid('group_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedBy: varchar('approved_by', { length: 50 }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    declinedBy: varchar('declined_by', { length: 50 }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    expiredReason: varchar('expired_reason', { length: 50 }), // ttl_exceeded, slot_filled
    fspReservationId: varchar('fsp_reservation_id', { length: 50 }),
    fspValidationErrors: jsonb('fsp_validation_errors'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_suggestions_queue').on(table.operatorId, table.status, table.type),
    index('idx_suggestions_expiry').on(table.operatorId, table.expiresAt),
    index('idx_suggestions_slot').on(table.operatorId, table.locationId, table.proposedStart),
    index('idx_suggestions_group').on(table.groupId),
  ],
);
