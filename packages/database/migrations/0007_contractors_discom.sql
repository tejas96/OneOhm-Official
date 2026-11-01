CREATE TYPE "public"."contractor_kind" AS ENUM('company', 'individual');--> statement-breakpoint
CREATE TYPE "public"."contractor_rate_basis" AS ENUM('per_kwp', 'per_job', 'per_day', 'per_task');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."change_request_step_status" AS ENUM('pending', 'ready', 'in_progress', 'waiting', 'completed');--> statement-breakpoint
CREATE TYPE "public"."change_request_type" AS ENUM('consumer_name_change', 'name_spelling_correction', 'property_type_change', 'load_change', 'new_ev_meter', 'new_connection');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'work_order_tds' BEFORE 'reversal';--> statement-breakpoint
CREATE TABLE "contractor_members" (
	"contractor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_members_contractor_id_user_id_pk" PRIMARY KEY("contractor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contractor_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contractor_id" uuid NOT NULL,
	"basis" "contractor_rate_basis" NOT NULL,
	"task_key" text,
	"project_type" "project_type",
	"label" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "contractor_kind" DEFAULT 'company' NOT NULL,
	"contact_name" text,
	"phone_e164" text,
	"email" text,
	"gstin" text,
	"pan" text,
	"address" text,
	"bank_account_name" text,
	"bank_account_number" text,
	"bank_ifsc" text,
	"payment_terms_days" integer DEFAULT 15 NOT NULL,
	"tds_bp" integer DEFAULT 100 NOT NULL,
	"retention_bp" integer DEFAULT 0 NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"skills" text[] NOT NULL,
	"service_areas" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"payable_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"rate_id" uuid,
	"basis" "contractor_rate_basis" NOT NULL,
	"task_key" text,
	"description" text NOT NULL,
	"quantity_milli" integer NOT NULL,
	"unit_rate_paise" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_rework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"task_id" uuid,
	"note" text NOT NULL,
	"deduction_paise" bigint DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_tasks" (
	"work_order_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "work_order_tasks_work_order_id_task_id_pk" PRIMARY KEY("work_order_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"contractor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "work_order_status" DEFAULT 'open' NOT NULL,
	"scope" text,
	"due_date" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_reason" text,
	"gross_paise" bigint DEFAULT 0 NOT NULL,
	"rework_deductions_paise" bigint DEFAULT 0 NOT NULL,
	"retention_paise" bigint DEFAULT 0 NOT NULL,
	"tds_paise" bigint DEFAULT 0 NOT NULL,
	"advances_paise" bigint DEFAULT 0 NOT NULL,
	"net_payable_paise" bigint DEFAULT 0 NOT NULL,
	"payable_id" uuid,
	"retention_payable_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_request_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_request_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"role_key" text NOT NULL,
	"assignee_user_id" uuid,
	"status" "change_request_step_status" DEFAULT 'pending' NOT NULL,
	"waiting_party" "waiting_party" DEFAULT 'internal' NOT NULL,
	"captures" text[] NOT NULL,
	"due_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"waiting_since" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"next_follow_up_on" date,
	"note" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"type" "change_request_type" NOT NULL,
	"status" "change_request_status" DEFAULT 'open' NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"project_id" uuid,
	"discom_id" uuid,
	"values" jsonb NOT NULL,
	"captured" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_values" jsonb,
	"applied_values" jsonb,
	"reference_number" text,
	"note" text,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_follow_ups" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"reference_number" text,
	"office" text,
	"next_follow_up_on" date,
	"note" text,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contractor_members" ADD CONSTRAINT "contractor_members_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_members" ADD CONSTRAINT "contractor_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_rates" ADD CONSTRAINT "contractor_rates_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_advances" ADD CONSTRAINT "work_order_advances_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_advances" ADD CONSTRAINT "work_order_advances_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_advances" ADD CONSTRAINT "work_order_advances_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_rate_id_contractor_rates_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."contractor_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_rework" ADD CONSTRAINT "work_order_rework_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_rework" ADD CONSTRAINT "work_order_rework_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_rework" ADD CONSTRAINT "work_order_rework_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_retention_payable_id_payables_id_fk" FOREIGN KEY ("retention_payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_steps" ADD CONSTRAINT "change_request_steps_change_request_id_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_steps" ADD CONSTRAINT "change_request_steps_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_steps" ADD CONSTRAINT "change_request_steps_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_discom_id_discoms_id_fk" FOREIGN KEY ("discom_id") REFERENCES "public"."discoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_follow_ups" ADD CONSTRAINT "discom_follow_ups_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_follow_ups" ADD CONSTRAINT "discom_follow_ups_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_members_user_unique" ON "contractor_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contractor_rates_contractor_idx" ON "contractor_rates" USING btree ("contractor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contractors_name_unique" ON "contractors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "work_order_lines_order_idx" ON "work_order_lines" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_rework_order_idx" ON "work_order_rework" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_tasks_task_unique" ON "work_order_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_number_unique" ON "work_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "work_orders_contractor_idx" ON "work_orders" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "work_orders_project_idx" ON "work_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "change_request_steps_request_idx" ON "change_request_steps" USING btree ("change_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_number_unique" ON "change_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "change_requests_property_idx" ON "change_requests" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "change_requests_project_idx" ON "change_requests" USING btree ("project_id");