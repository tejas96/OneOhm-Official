CREATE TABLE "change_request_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discom_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"documents" text[] DEFAULT '{}'::text[] NOT NULL,
	"steps" jsonb NOT NULL,
	"blocks" jsonb NOT NULL,
	"updates" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_report_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discom_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"only_with_subsidy" boolean DEFAULT false NOT NULL,
	"customer_visible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'built_in' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_requests" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "type_id" uuid;--> statement-breakpoint
ALTER TABLE "change_request_types" ADD CONSTRAINT "change_request_types_discom_id_discoms_id_fk" FOREIGN KEY ("discom_id") REFERENCES "public"."discoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_types" ADD CONSTRAINT "change_request_types_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_report_templates" ADD CONSTRAINT "discom_report_templates_discom_id_discoms_id_fk" FOREIGN KEY ("discom_id") REFERENCES "public"."discoms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_report_templates" ADD CONSTRAINT "discom_report_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "change_request_types_discom_key" ON "change_request_types" USING btree ("discom_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "discom_report_templates_discom_key" ON "discom_report_templates" USING btree ("discom_id","key");--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_type_id_change_request_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."change_request_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."change_request_type";--> statement-breakpoint
-- PRD 3.18: the Model Agreement is made at project onboarding, not at the DISCOM sanction.
UPDATE "task_templates" SET "reports" = array_remove("reports", 'model-agreement') WHERE "key" IN ('discom_sanction', 'tata_sanction', 'adani_sanction', 'best_sanction');--> statement-breakpoint
UPDATE "project_tasks" SET "reports" = array_remove("reports", 'model-agreement') WHERE "template_key" IN ('discom_sanction', 'tata_sanction', 'adani_sanction', 'best_sanction');
