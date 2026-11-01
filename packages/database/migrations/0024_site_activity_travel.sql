ALTER TYPE "public"."payable_party" ADD VALUE 'employee';--> statement-breakpoint
CREATE TABLE "document_geotags" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone,
	"source" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" integer,
	"distance_m" integer,
	"far_from_site" boolean,
	"location_cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"project_id" uuid,
	"property_id" uuid,
	"kind" text NOT NULL,
	"work_date" date NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_in_latitude" double precision,
	"check_in_longitude" double precision,
	"check_in_accuracy_m" integer,
	"check_in_distance_m" integer,
	"check_in_far" boolean,
	"check_out_at" timestamp with time zone,
	"check_out_latitude" double precision,
	"check_out_longitude" double precision,
	"check_out_accuracy_m" integer,
	"check_out_distance_m" integer,
	"check_out_far" boolean,
	"location_cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"distance_m" integer NOT NULL,
	"rate_paise_per_km" integer NOT NULL,
	"amount_paise" bigint NOT NULL,
	"legs" jsonb NOT NULL,
	"visits" integer NOT NULL,
	"note" text,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"payable_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_consents" ADD COLUMN "text_version" integer;--> statement-breakpoint
ALTER TABLE "document_geotags" ADD CONSTRAINT "document_geotags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_visits_user_date_idx" ON "site_visits" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "site_visits_task_idx" ON "site_visits" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "site_visits_project_idx" ON "site_visits" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_visits_open_unique" ON "site_visits" USING btree ("user_id") WHERE "site_visits"."check_out_at" is null;--> statement-breakpoint
CREATE INDEX "travel_claims_status_idx" ON "travel_claims" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_claims_day_unique" ON "travel_claims" USING btree ("user_id","work_date") WHERE "travel_claims"."status" in ('pending', 'approved');