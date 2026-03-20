CREATE TABLE "cancellation_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disruption_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"affected_reservation_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_student_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_aircraft_ids" jsonb DEFAULT '[]'::jsonb,
	"location_id" varchar(50),
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solver_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"run_type" varchar(30) NOT NULL,
	"input_params" jsonb NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cancellation_reasons_operator" ON "cancellation_reasons" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_disruption_events_active" ON "disruption_events" USING btree ("operator_id","is_active","detected_at");--> statement-breakpoint
CREATE INDEX "idx_solver_runs_operator_created" ON "solver_runs" USING btree ("operator_id","created_at");