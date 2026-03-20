ALTER TABLE "notification_records" DROP CONSTRAINT "notification_records_operator_id_operators_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_records" DROP CONSTRAINT "notification_records_suggestion_id_suggestions_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_templates" DROP CONSTRAINT "notification_templates_operator_id_operators_id_fk";
--> statement-breakpoint
ALTER TABLE "prospects" DROP CONSTRAINT "prospects_operator_id_operators_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduling_policies" DROP CONSTRAINT "scheduling_policies_operator_id_operators_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_operator_id_operators_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_prospect_id_prospects_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_state" DROP CONSTRAINT "sync_state_operator_id_operators_id_fk";
