CREATE TABLE "service_visit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_request_id" uuid NOT NULL,
	"site_visit_id" uuid,
	"user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"found" text,
	"work_done" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "service_request_id" uuid;--> statement-breakpoint
ALTER TABLE "service_visit_reports" ADD CONSTRAINT "service_visit_reports_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visit_reports" ADD CONSTRAINT "service_visit_reports_site_visit_id_site_visits_id_fk" FOREIGN KEY ("site_visit_id") REFERENCES "public"."site_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visit_reports" ADD CONSTRAINT "service_visit_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_visit_reports_request_idx" ON "service_visit_reports" USING btree ("service_request_id");--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_visits_service_request_idx" ON "site_visits" USING btree ("service_request_id");