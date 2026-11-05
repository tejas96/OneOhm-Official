CREATE TYPE "public"."customer_action_status" AS ENUM('open', 'received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."customer_action_type" AS ENUM('paper', 'location', 'self_survey', 'visit_pick', 'presence', 'signature', 'pay', 'confirm', 'rating', 'payout', 'callback');--> statement-breakpoint
CREATE TABLE "customer_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "customer_action_type" NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid,
	"project_id" uuid,
	"property_id" uuid,
	"task_id" uuid,
	"title" text NOT NULL,
	"requirement_key" text,
	"category" text,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" "customer_action_status" DEFAULT 'open' NOT NULL,
	"document_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_user_id" uuid,
	"done_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "checked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_actions_customer_idx" ON "customer_actions" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_actions_project_idx" ON "customer_actions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "customer_actions_lead_idx" ON "customer_actions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "customer_actions_task_idx" ON "customer_actions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "customer_actions_status_type_idx" ON "customer_actions" USING btree ("status","type");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Papers already on file are taken as checked, so the team is not flooded: checked when they came in.
UPDATE "documents" SET "checked_at" = "created_at" WHERE "checked_at" IS NULL;--> statement-breakpoint
-- Every paper request becomes a customer action of type paper; ids, times, files, notes and askers are kept.
-- received stays received only while its file is not checked (none are, after the line above); a received
-- request with no file left has nothing to check and is closed. The latest "ask again" reason is read from the audit trail.
INSERT INTO "customer_actions" ("id", "type", "customer_id", "project_id", "property_id", "title", "category", "note", "reason", "status", "document_id", "requested_by_user_id", "done_at", "closed_at", "cancelled_at", "created_at", "updated_at")
SELECT "r"."id", 'paper', "r"."customer_id", "r"."project_id", "p"."property_id", "r"."title", "r"."category", "r"."note",
  COALESCE((SELECT "a"."data"->>'note' FROM "audit_log" AS "a" WHERE "a"."entity" = 'document_request' AND "a"."action" = 'document_request.reasked' AND "a"."entity_id" = "r"."id"::text ORDER BY "a"."created_at" DESC LIMIT 1), ''),
  CASE "r"."status"::text
    WHEN 'open' THEN 'open'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE CASE WHEN "d"."id" IS NOT NULL AND "d"."checked_at" IS NULL THEN 'received' ELSE 'closed' END
  END::"customer_action_status",
  "r"."document_id", "r"."requested_by_user_id", "r"."received_at",
  CASE WHEN "r"."status"::text = 'received' AND NOT ("d"."id" IS NOT NULL AND "d"."checked_at" IS NULL) THEN COALESCE("r"."received_at", "r"."updated_at") END,
  "r"."cancelled_at", "r"."created_at", "r"."updated_at"
FROM "document_requests" AS "r"
LEFT JOIN "projects" AS "p" ON "p"."id" = "r"."project_id"
LEFT JOIN "documents" AS "d" ON "d"."id" = "r"."document_id";--> statement-breakpoint
-- Old rows keep their audit names (entity document_request); new rows are customer_action.*.
ALTER TABLE "document_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "document_requests" CASCADE;--> statement-breakpoint
DROP TYPE "public"."document_request_status";
