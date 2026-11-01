ALTER TABLE "task_templates" ADD COLUMN "checklist" jsonb;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "checklist" jsonb;