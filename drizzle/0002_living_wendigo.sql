CREATE TABLE "activity_types" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aircraft" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"registration" varchar(20) NOT NULL,
	"make_model" varchar(100),
	"is_simulator" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"instructor_type" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" integer NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"instructor_id" varchar(50),
	"aircraft_id" varchar(50),
	"activity_type_id" varchar(50),
	"location_id" varchar(50),
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"total_flight_hours" numeric(8, 1) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_activity_types_operator" ON "activity_types" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_aircraft_operator" ON "aircraft" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_instructors_operator" ON "instructors" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "idx_reservation_history_student" ON "reservation_history" USING btree ("operator_id","student_id","end_time");--> statement-breakpoint
CREATE INDEX "idx_reservation_history_operator" ON "reservation_history" USING btree ("operator_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_students_operator" ON "students" USING btree ("operator_id");