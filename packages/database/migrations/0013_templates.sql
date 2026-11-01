CREATE TABLE "message_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"meta_name" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"fields" text[] NOT NULL,
	"preview" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "notify_event" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "message_key" text DEFAULT 'project_milestone' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "customer_title" text;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "notify_manager" boolean DEFAULT false NOT NULL;