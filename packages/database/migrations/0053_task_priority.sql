CREATE TYPE "public"."task_priority" AS ENUM('none', 'urgent', 'high', 'medium', 'low');--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "priority" "task_priority" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "priority_set_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_priority_set_by_user_id_users_id_fk" FOREIGN KEY ("priority_set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;