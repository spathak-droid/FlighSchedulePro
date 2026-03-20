CREATE TABLE "student_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"student_name" varchar(200) NOT NULL,
	"last_flight_date" timestamp with time zone,
	"next_flight_date" timestamp with time zone,
	"days_since_last_flight" integer,
	"total_flight_hours" numeric(8, 1) DEFAULT '0' NOT NULL,
	"enrollment_progress" numeric(5, 2),
	"is_inactive" boolean DEFAULT false NOT NULL,
	"is_checkride_ready" boolean DEFAULT false NOT NULL,
	"is_at_risk" boolean DEFAULT false NOT NULL,
	"risk_reason" varchar(500),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" varchar(50) NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"temperature" numeric(6, 2),
	"wind_speed" numeric(6, 2),
	"wind_gust" numeric(6, 2),
	"wind_direction" integer,
	"visibility" numeric(8, 2),
	"cloud_cover" integer,
	"weather_code" integer,
	"flight_category" varchar(10),
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_student_insights_inactive" ON "student_insights" USING btree ("operator_id","is_inactive");--> statement-breakpoint
CREATE INDEX "idx_student_insights_checkride" ON "student_insights" USING btree ("operator_id","is_checkride_ready");--> statement-breakpoint
CREATE INDEX "idx_student_insights_operator" ON "student_insights" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_weather_observations_location_time" ON "weather_observations" USING btree ("location_id","observed_at");