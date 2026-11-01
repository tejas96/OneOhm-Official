CREATE TABLE "report_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_key" text NOT NULL,
	"document_id" uuid,
	"fingerprint" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_waits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"party" "waiting_party" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "ev_meter_number" text;--> statement-breakpoint
ALTER TABLE "report_settings" ADD COLUMN "auto_generate" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "contractor_id" uuid;--> statement-breakpoint
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_waits" ADD CONSTRAINT "task_waits_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_submissions_unique" ON "report_submissions" USING btree ("project_id","report_key");--> statement-breakpoint
CREATE INDEX "task_waits_task_idx" ON "task_waits" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_lead_idx" ON "documents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "documents_vendor_idx" ON "documents" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "documents_contractor_idx" ON "documents" USING btree ("contractor_id");--> statement-breakpoint
-- Every statutory report field has a task that records it (PRD 3.18). Existing library
-- tasks gain the details they now capture; anything an owner already added stays.
UPDATE "task_templates" AS t SET "updated_at" = now(), "captures" = t."captures" ||
  coalesce((SELECT array_agg(f) FROM unnest(v.facts) AS f WHERE NOT (f = ANY(t."captures"))), '{}'::text[])
FROM (VALUES
  ('electricity_details', ARRAY['consumer_aadhaar_number']),
  ('system_design', ARRAY['module_model_number', 'module_efficiency', 'module_warranty']),
  ('inverter_installation', ARRAY['charge_controller_type', 'inverter_hpd', 'inverter_year_of_manufacturing']),
  ('installation_complete', ARRAY['cmc_period_years'])
) AS v(key, facts)
WHERE t."key" = v.key;--> statement-breakpoint
-- The generation meter's details are recorded when it is fitted ("Install the generation
-- meter", added by the seed), so the covering letter prints before MSEDCL's test.
UPDATE "task_templates" SET
  "captures" = CASE WHEN "captures" = ARRAY['meter_serial_number','meter_make','meter_capacity'] THEN '{}'::text[] ELSE "captures" END,
  "reports" = CASE WHEN "reports" = ARRAY['meter-test-letter'] THEN '{}'::text[] ELSE "reports" END,
  "depends_on" = CASE WHEN 'install_generation_meter' = ANY("depends_on") THEN "depends_on" ELSE "depends_on" || ARRAY['install_generation_meter'] END,
  "updated_at" = now()
WHERE "key" = 'generation_meter_test';--> statement-breakpoint
-- A consumer name change is one track: a DISCOM change request linked to the project
-- (PRD 3.15), raised at project creation, instead of a separate task.
UPDATE "task_templates" SET "active" = false, "updated_at" = now() WHERE "key" = 'name_change';--> statement-breakpoint
UPDATE "task_templates" SET "depends_on" = array_remove("depends_on", 'name_change'), "updated_at" = now()
WHERE 'name_change' = ANY("depends_on");--> statement-breakpoint
-- Tata Power, Adani and BEST get their own net-metering steps (added by the seed); the
-- handover and the subsidy claim wait for whichever DISCOM's net meter applies.
UPDATE "task_templates" AS t SET "updated_at" = now(), "depends_on" = t."depends_on" ||
  coalesce((SELECT array_agg(d) FROM unnest(v.deps) AS d WHERE NOT (d = ANY(t."depends_on"))), '{}'::text[])
FROM (VALUES
  ('handover', ARRAY['tata_net_meter', 'adani_net_meter', 'best_net_meter']),
  ('subsidy_application', ARRAY['tata_net_meter', 'adani_net_meter', 'best_net_meter'])
) AS v(key, deps)
WHERE t."key" = v.key;
