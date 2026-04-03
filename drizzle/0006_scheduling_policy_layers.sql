-- Add operator-configurable scheduling rule columns (Layer 3)
-- These allow operators to set stricter limits than system defaults,
-- but NEVER looser than the fixed system policies (Layer 1 & 2).

ALTER TABLE "scheduling_policies"
  ADD COLUMN IF NOT EXISTS "lesson_buffer_minutes" integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "min_booking_notice_hours" integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "max_instructor_flights_per_day" integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "max_student_flights_per_day" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "max_instructor_duty_hours" integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "require_instructor_type_match" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "instructor_continuity_weight" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "preferred_time_block" jsonb NOT NULL DEFAULT '"all_day"',
  ADD COLUMN IF NOT EXISTS "cancellation_reschedule_priority" integer NOT NULL DEFAULT 3;

-- Add constraints to prevent operators from exceeding system maximums
ALTER TABLE "scheduling_policies"
  ADD CONSTRAINT "chk_instructor_duty_hours" CHECK ("max_instructor_duty_hours" >= 1 AND "max_instructor_duty_hours" <= 8),
  ADD CONSTRAINT "chk_instructor_flights" CHECK ("max_instructor_flights_per_day" >= 1 AND "max_instructor_flights_per_day" <= 8),
  ADD CONSTRAINT "chk_student_flights" CHECK ("max_student_flights_per_day" >= 1 AND "max_student_flights_per_day" <= 3),
  ADD CONSTRAINT "chk_lesson_buffer" CHECK ("lesson_buffer_minutes" >= 15 AND "lesson_buffer_minutes" <= 60),
  ADD CONSTRAINT "chk_booking_notice" CHECK ("min_booking_notice_hours" >= 2 AND "min_booking_notice_hours" <= 72),
  ADD CONSTRAINT "chk_continuity_weight" CHECK ("instructor_continuity_weight" >= 0 AND "instructor_continuity_weight" <= 100),
  ADD CONSTRAINT "chk_reschedule_priority" CHECK ("cancellation_reschedule_priority" >= 1 AND "cancellation_reschedule_priority" <= 5);
