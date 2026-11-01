ALTER TABLE "projects" ADD COLUMN "budget_status" text DEFAULT 'awaiting_survey' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "survey_variance_paise" bigint;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "survey_variance_bp" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "budget_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "revision_quotation_id" uuid;--> statement-breakpoint
-- Projects whose survey was already done before this change count as checked and locked.
UPDATE "projects" AS p SET "budget_status" = 'locked', "budget_locked_at" = t."completed_at" FROM "project_tasks" AS t WHERE t."project_id" = p."id" AND t."template_key" = 'site_survey' AND t."status" = 'completed' AND p."budget_status" = 'awaiting_survey';
