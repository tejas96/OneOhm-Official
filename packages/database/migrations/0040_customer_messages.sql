ALTER TABLE "task_templates" ADD COLUMN "recipients" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "attachment" text;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "visit_on" date;--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "meta_name_mr" text;--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "meta_name_hi" text;