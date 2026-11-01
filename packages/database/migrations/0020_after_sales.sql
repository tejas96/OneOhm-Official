CREATE TABLE "amc_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"visit_name" text NOT NULL,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"visits_per_year" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"price_paise" bigint NOT NULL,
	"note" text,
	"sold_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amc_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_paise" bigint NOT NULL,
	"visits_per_year" integer NOT NULL,
	"duration_months" integer NOT NULL,
	"visit_name" text NOT NULL,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amc_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"due_on" date NOT NULL,
	"service_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installed_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"make" text,
	"model" text NOT NULL,
	"product_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"serial_numbers" text[] DEFAULT '{}' NOT NULL,
	"warranty_starts_on" date NOT NULL,
	"warranty_ends_on" date NOT NULL,
	"performance_ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"customer_label" text NOT NULL,
	"response_hours" integer NOT NULL,
	"resolution_hours" integer NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_request_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranty_policy" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"policy" jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "resolution_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_plan_id_amc_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."amc_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_sold_by_user_id_users_id_fk" FOREIGN KEY ("sold_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amc_visits" ADD CONSTRAINT "amc_visits_contract_id_amc_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."amc_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amc_visits" ADD CONSTRAINT "amc_visits_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_assets" ADD CONSTRAINT "installed_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_assets" ADD CONSTRAINT "installed_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_ratings" ADD CONSTRAINT "service_ratings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_policy" ADD CONSTRAINT "warranty_policy_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amc_contracts_project_idx" ON "amc_contracts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amc_visits_contract_position_unique" ON "amc_visits" USING btree ("contract_id","position");--> statement-breakpoint
CREATE INDEX "amc_visits_due_idx" ON "amc_visits" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "amc_visits_request_idx" ON "amc_visits" USING btree ("service_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installed_assets_project_kind_unique" ON "installed_assets" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_key_unique" ON "service_categories" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "service_ratings_request_unique" ON "service_ratings" USING btree ("service_request_id");--> statement-breakpoint
-- Battery serials are recorded on the installed assets and the warranty (PRD 3.17).
UPDATE "task_templates" SET "captures" = array_append("captures", 'battery_serial_number') WHERE "key" = 'battery_installation' AND NOT ('battery_serial_number' = ANY("captures"));--> statement-breakpoint
UPDATE "project_tasks" SET "captures" = array_append("captures", 'battery_serial_number') WHERE "template_key" = 'battery_installation' AND "status" <> 'completed' AND NOT ('battery_serial_number' = ANY("captures"));
