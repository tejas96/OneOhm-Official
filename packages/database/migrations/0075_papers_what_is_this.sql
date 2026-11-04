ALTER TABLE "document_requirements" ADD COLUMN "max_age_days" integer;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD COLUMN "reminders_paused_until" timestamp with time zone;--> statement-breakpoint
UPDATE "document_requirements" SET "max_age_days" = 90 WHERE "key" = 'bill' AND "built_in";
