CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" uuid,
	"actor_id" varchar(50),
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"suggestion_id" uuid,
	"recipient_type" varchar(20) NOT NULL,
	"recipient_id" varchar(50) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"template_id" varchar(50),
	"content" jsonb NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"delivery_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"subject" varchar(255),
	"body_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notification_templates_operator_type_channel" UNIQUE("operator_id","type","channel")
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"fsp_token" text,
	"fsp_token_expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"preferred_dates" jsonb,
	"notes" text,
	"fsp_reservation_id" varchar(50),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"waitlist_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reschedule_alternatives_count" integer DEFAULT 5 NOT NULL,
	"search_window_initial_days" integer DEFAULT 7 NOT NULL,
	"search_window_increment_days" integer DEFAULT 7 NOT NULL,
	"search_window_max_days" integer DEFAULT 28 NOT NULL,
	"suggestion_ttl_hours" integer DEFAULT 24 NOT NULL,
	"polling_interval_minutes" integer DEFAULT 5 NOT NULL,
	"notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_policies_operator_id_unique" UNIQUE("operator_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"location_id" varchar(50) NOT NULL,
	"student_id" varchar(50),
	"prospect_id" uuid,
	"instructor_id" varchar(50),
	"aircraft_id" varchar(50),
	"proposed_start" timestamp with time zone NOT NULL,
	"proposed_end" timestamp with time zone NOT NULL,
	"activity_type_id" varchar(50),
	"course_id" varchar(50),
	"lesson_id" varchar(50),
	"enrollment_id" varchar(50),
	"ranking_score" numeric(10, 4),
	"rationale" jsonb NOT NULL,
	"group_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by" varchar(50),
	"approved_at" timestamp with time zone,
	"declined_by" varchar(50),
	"declined_at" timestamp with time zone,
	"expired_reason" varchar(50),
	"fsp_reservation_id" varchar(50),
	"fsp_validation_errors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"last_schedule_hash" varchar(64),
	"last_schedule_sync_at" timestamp with time zone,
	"last_resource_sync_at" timestamp with time zone,
	"last_student_sync_at" timestamp with time zone,
	"sync_errors" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_operator_id_unique" UNIQUE("operator_id")
);
--> statement-breakpoint
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_policies" ADD CONSTRAINT "scheduling_policies_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_events_operator_time" ON "audit_events" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_operator_type_time" ON "audit_events" USING btree ("operator_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_suggestions_queue" ON "suggestions" USING btree ("operator_id","status","type");--> statement-breakpoint
CREATE INDEX "idx_suggestions_expiry" ON "suggestions" USING btree ("operator_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_suggestions_slot" ON "suggestions" USING btree ("operator_id","location_id","proposed_start");--> statement-breakpoint
CREATE INDEX "idx_suggestions_group" ON "suggestions" USING btree ("group_id");