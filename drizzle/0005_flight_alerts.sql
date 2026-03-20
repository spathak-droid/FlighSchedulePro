CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"flag_name" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"reservation_id" varchar(50),
	"alert_type" varchar(30) NOT NULL,
	"severity" varchar(10) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"aircraft_id" varchar(50),
	"instructor_id" varchar(50),
	"student_id" varchar(50),
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_feature_flags_operator_flag" ON "feature_flags" USING btree ("operator_id","flag_name");--> statement-breakpoint
CREATE INDEX "idx_feature_flags_operator" ON "feature_flags" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_flight_alerts_active" ON "flight_alerts" USING btree ("operator_id","is_resolved","created_at");