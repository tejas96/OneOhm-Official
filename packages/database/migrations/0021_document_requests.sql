CREATE TYPE "public"."document_request_status" AS ENUM('open', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "document_request_status" DEFAULT 'open' NOT NULL,
	"document_id" uuid,
	"requested_by_user_id" uuid,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"customer_visible" boolean NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_requests_customer_idx" ON "document_requests" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "document_requests_project_idx" ON "document_requests" USING btree ("project_id");--> statement-breakpoint
-- New document rights (PRD 3.14). Existing staff roles keep what they could do before:
-- anyone who could see documents may still download and print them.
INSERT INTO "role_capabilities" ("role_id", "capability")
SELECT rc."role_id", c."capability"
FROM "role_capabilities" rc
JOIN "roles" r ON r."id" = rc."role_id" AND r."kind" = 'staff'
CROSS JOIN (VALUES ('documents.download'), ('documents.print')) AS c("capability")
WHERE rc."capability" = 'documents.view'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Whoever could manage documents may upload; so may the roles that collect customer papers.
INSERT INTO "role_capabilities" ("role_id", "capability")
SELECT r."id", 'documents.upload'
FROM "roles" r
WHERE EXISTS (
    SELECT 1 FROM "role_capabilities" rc
    WHERE rc."role_id" = r."id" AND rc."capability" = 'documents.manage'
  )
  OR r."key" IN ('sales', 'loan', 'service')
ON CONFLICT DO NOTHING;
