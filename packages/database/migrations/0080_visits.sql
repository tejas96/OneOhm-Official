CREATE TYPE "public"."visit_kind" AS ENUM('survey', 'installation', 'inspection', 'net_meter', 'amc', 'service');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('proposed', 'confirmed', 'done', 'cancelled', 'missed');--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "visit_kind" NOT NULL,
	"status" "visit_status" NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"lead_id" uuid,
	"service_request_id" uuid,
	"amc_visit_id" uuid,
	"task_id" uuid,
	"property_id" uuid,
	"day" date NOT NULL,
	"slot" text NOT NULL,
	"crew_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"proposed_by" text NOT NULL,
	"proposed_by_user_id" uuid,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"customer_confirmed_at" timestamp with time zone,
	"customer_cannot_at" timestamp with time zone,
	"told_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"unconfirmed_alert_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"missed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_amc_visit_id_amc_visits_id_fk" FOREIGN KEY ("amc_visit_id") REFERENCES "public"."amc_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_customer_idx" ON "visits" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "visits_day_idx" ON "visits" USING btree ("day","status");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_open_task" ON "visits" USING btree ("task_id") WHERE "visits"."status" in ('proposed','confirmed') and "visits"."task_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_open_service" ON "visits" USING btree ("service_request_id") WHERE "visits"."status" in ('proposed','confirmed') and "visits"."service_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_open_lead" ON "visits" USING btree ("lead_id","kind") WHERE "visits"."status" in ('proposed','confirmed') and "visits"."lead_id" is not null and "visits"."task_id" is null and "visits"."service_request_id" is null;--> statement-breakpoint
-- A day still ahead on a service request (including AMC visits) becomes its visit record, so nothing shows two dates; days already past are left alone (they would only raise missed-visit alerts).
INSERT INTO "visits" ("kind", "status", "customer_id", "project_id", "service_request_id", "amc_visit_id", "day", "slot", "crew_user_ids", "proposed_by", "confirmed_at")
SELECT CASE WHEN a."id" IS NULL THEN 'service'::"visit_kind" ELSE 'amc'::"visit_kind" END, 'confirmed', r."customer_id", r."project_id", r."id", a."id", r."visit_on", 'morning',
       CASE WHEN r."assignee_user_id" IS NULL THEN '{}'::uuid[] ELSE ARRAY[r."assignee_user_id"] END, 'staff', now()
FROM "service_requests" r LEFT JOIN "amc_visits" a ON a."service_request_id" = r."id"
WHERE r."visit_on" IS NOT NULL AND r."status" <> 'resolved' AND r."visit_on" >= current_date
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- New customer templates for visits: off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('visit_pick', 'customer', 'visit_pick', ARRAY['customer','home','work'], 'Hello {{1}}, when can our team visit {{2}} for the {{3}}? Tap the button below to pick a day.', false),
('visit_booked', 'customer', 'visit_booked', ARRAY['customer','when','staff'], 'Hello {{1}}, your visit is booked ✅ {{2}}. {{3}} will call before coming.', false),
('visit_reminder', 'customer', 'visit_reminder', ARRAY['customer','home','when','work'], 'Hello {{1}}, our team visits {{2}} {{3}} for the {{4}}. Please confirm.', false),
('inspection_presence', 'customer', 'inspection_presence', ARRAY['customer','work','home','day'], 'Hello {{1}}, the electricity board (DISCOM) will do the {{2}} at {{3}} on {{4}}. Please be at home.', false)
ON CONFLICT ("key") DO NOTHING;
