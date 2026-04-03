import { pgTable, uuid, integer, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';

export const schedulingPolicies = pgTable('scheduling_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull().unique(), // FK: operators(id) - enforced via migration

  // ─── Waitlist & Ranking ────────────────────────────────────────────────────
  waitlistWeights: jsonb('waitlist_weights').notNull().default({}),
  rescheduleAlternativesCount: integer('reschedule_alternatives_count').notNull().default(5),

  // ─── Search Window ─────────────────────────────────────────────────────────
  searchWindowInitialDays: integer('search_window_initial_days').notNull().default(7),
  searchWindowIncrementDays: integer('search_window_increment_days').notNull().default(7),
  searchWindowMaxDays: integer('search_window_max_days').notNull().default(28),

  // ─── Suggestion Lifecycle ──────────────────────────────────────────────────
  suggestionTtlHours: integer('suggestion_ttl_hours').notNull().default(24),
  pollingIntervalMinutes: integer('polling_interval_minutes').notNull().default(5),

  // ─── Operator-Configurable Scheduling Rules (Layer 3) ─────────────────────

  /** Buffer time between lessons for debrief/taxi/preflight (minutes). Min: 15 */
  lessonBufferMinutes: integer('lesson_buffer_minutes').notNull().default(15),

  /** Minimum hours in advance a suggestion can be created. Min: 2 (system policy) */
  minBookingNoticeHours: integer('min_booking_notice_hours').notNull().default(24),

  /** Max instructor flights per day (operator can set lower than system max of 8) */
  maxInstructorFlightsPerDay: integer('max_instructor_flights_per_day').notNull().default(6),

  /** Max student flights per day (operator can set lower than system max of 3) */
  maxStudentFlightsPerDay: integer('max_student_flights_per_day').notNull().default(3),

  /** Max instructor duty hours per day (operator can set lower than system max of 8) */
  maxInstructorDutyHours: integer('max_instructor_duty_hours').notNull().default(8),

  /** Require instructor type to match activity (CFI for PPL, CFII for IR) */
  requireInstructorTypeMatch: boolean('require_instructor_type_match').notNull().default(true),

  /** Instructor continuity weight — how much to prioritize keeping same instructor (0-100) */
  instructorContinuityWeight: integer('instructor_continuity_weight').notNull().default(30),

  /** Preferred scheduling time block: 'morning', 'afternoon', 'all_day' */
  preferredTimeBlock: jsonb('preferred_time_block').notNull().default('"all_day"'),

  /** How urgently to prioritize cancelled-slot backfill (1=low, 5=high) */
  cancellationReschedulePriority: integer('cancellation_reschedule_priority').notNull().default(3),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notificationPreferences: jsonb('notification_preferences').notNull().default({}),

  // ─── Timestamps ────────────────────────────────────────────────────────────
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
