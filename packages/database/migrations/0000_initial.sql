CREATE TYPE "public"."customer_kind" AS ENUM('individual', 'organization');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('upload', 'system', 'report');--> statement-breakpoint
CREATE TYPE "public"."epc_stage" AS ENUM('survey', 'design', 'material', 'installation', 'commissioning', 'net_metering', 'subsidy');--> statement-breakpoint
CREATE TYPE "public"."lead_activity_kind" AS ENUM('note', 'call', 'visit', 'whatsapp', 'stage_change', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('manual', 'website', 'whatsapp', 'employee', 'reseller', 'referral');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'survey_scheduled', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('upcoming', 'due', 'partly_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."outbox_channel" AS ENUM('whatsapp', 'sms', 'push');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."payable_party" AS ENUM('vendor', 'contractor');--> statement-breakpoint
CREATE TYPE "public"."payable_status" AS ENUM('pending', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."payer" AS ENUM('customer', 'bank');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'cheque', 'bank_transfer', 'upi', 'razorpay', 'bank_disbursement');--> statement-breakpoint
CREATE TYPE "public"."electric_phase" AS ENUM('single', 'three');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('panel', 'inverter', 'battery', 'structure', 'cable', 'electrical', 'installation', 'transport', 'liaisoning', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'operational', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('residential', 'society', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."quantity_basis" AS ENUM('catalog', 'default', 'survey');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."role_kind" AS ENUM('staff', 'partner', 'reseller');--> statement-breakpoint
CREATE TYPE "public"."session_client" AS ENUM('web', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."structure_type" AS ENUM('rcc_elevated', 'tin_shed', 'ground_mount');--> statement-breakpoint
CREATE TYPE "public"."subsidy_category" AS ENUM('individual', 'society', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."system_type" AS ENUM('on_grid', 'hybrid', 'off_grid');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'ready', 'in_progress', 'waiting', 'in_review', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."waiting_party" AS ENUM('internal', 'customer', 'bank', 'discom');--> statement-breakpoint
CREATE TABLE "discoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"expected_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"category" "product_category" NOT NULL,
	"unit" text DEFAULT 'nos' NOT NULL,
	"wattage_wp" integer,
	"rated_w" integer,
	"dcr" boolean DEFAULT false NOT NULL,
	"price_paise" bigint NOT NULL,
	"cost_paise" bigint NOT NULL,
	"tax_rate_bp" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subsidy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "subsidy_category" NOT NULL,
	"valid_from" date NOT NULL,
	"slabs" jsonb NOT NULL,
	"cap_paise" bigint NOT NULL,
	"per_household_wp" integer,
	"max_eligible_wp" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"stage" "epc_stage" NOT NULL,
	"role_key" text NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"depends_on" text[] NOT NULL,
	"conditions" jsonb,
	"waiting_party" "waiting_party" DEFAULT 'internal' NOT NULL,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"notify_customer" boolean DEFAULT false NOT NULL,
	"approval" boolean DEFAULT false NOT NULL,
	"evidence" text[] NOT NULL,
	"captures" text[] NOT NULL,
	"on_complete" text,
	"reports" text[] NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"brand_name" text NOT NULL,
	"full_address" text NOT NULL,
	"short_address" text NOT NULL,
	"gstin" text NOT NULL,
	"email" text NOT NULL,
	"phones" text[] NOT NULL,
	"signatory_name" text NOT NULL,
	"signatory_designation" text NOT NULL,
	"signatory_phone" text NOT NULL,
	"signatory_email" text NOT NULL,
	"logo_key" text,
	"signature_key" text,
	"stamp_key" text,
	"quotation_validity_days" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "customer_kind" DEFAULT 'individual' NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"email" text,
	"whatsapp_opt_in" boolean DEFAULT true NOT NULL,
	"preferred_language" text DEFAULT 'en-IN' NOT NULL,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" "lead_activity_kind" NOT NULL,
	"note" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"property_id" uuid,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"email" text,
	"city" text NOT NULL,
	"source" "lead_source" DEFAULT 'manual' NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"owner_user_id" uuid,
	"reseller_user_id" uuid,
	"estimated_wp" integer,
	"subsidy_category" "subsidy_category" DEFAULT 'individual' NOT NULL,
	"next_action_on" date,
	"next_action_note" text,
	"lost_reason" text,
	"notes" text,
	"won_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"state" text DEFAULT 'Maharashtra' NOT NULL,
	"pincode" text,
	"latitude" double precision,
	"longitude" double precision,
	"subsidy_category" "subsidy_category" DEFAULT 'individual' NOT NULL,
	"households" integer,
	"discom_id" uuid,
	"consumer_number" text,
	"meter_holder_name" text,
	"sanctioned_load_w" integer,
	"phase" "electric_phase",
	"meter_in_society_name" boolean,
	"subsidy_claimed" boolean DEFAULT false NOT NULL,
	"floors" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"party" "payable_party" NOT NULL,
	"party_name" text NOT NULL,
	"party_user_id" uuid,
	"description" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"due_on" date NOT NULL,
	"status" "payable_status" DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"payer" "payer" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"trigger" text NOT NULL,
	"status" "milestone_status" DEFAULT 'upcoming' NOT NULL,
	"due_at" timestamp with time zone,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"payer" "payer" NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"received_on" date NOT NULL,
	"reference" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_capabilities" (
	"role_id" uuid NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "role_capabilities_role_id_capability_pk" PRIMARY KEY("role_id","capability")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "role_kind" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"client" "session_client" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"employee_code" text,
	"phone_e164" text,
	"password_hash" text,
	"designation" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"on_leave" boolean DEFAULT false NOT NULL,
	"avatar_swatch" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"user_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_facts" (
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"captured_by_task_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_facts_project_id_key_pk" PRIMARY KEY("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"title" text NOT NULL,
	"stage" "epc_stage" NOT NULL,
	"role_key" text NOT NULL,
	"assignee_user_id" uuid,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"waiting_party" "waiting_party" DEFAULT 'internal' NOT NULL,
	"start_date" date NOT NULL,
	"due_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"waiting_since" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"notify_customer" boolean DEFAULT false NOT NULL,
	"approval" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"evidence" text[] NOT NULL,
	"captures" text[] NOT NULL,
	"on_complete" text,
	"reports" text[] NOT NULL,
	"note" text,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"type" "project_type" NOT NULL,
	"discom_id" uuid NOT NULL,
	"capacity_wp" integer NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"current_stage" "epc_stage" DEFAULT 'survey' NOT NULL,
	"loan" boolean DEFAULT false NOT NULL,
	"lender_name" text,
	"loan_paise" bigint DEFAULT 0 NOT NULL,
	"battery" boolean DEFAULT false NOT NULL,
	"ground_mount" boolean DEFAULT false NOT NULL,
	"subsidy" boolean DEFAULT false NOT NULL,
	"name_change" boolean DEFAULT false NOT NULL,
	"manager_user_id" uuid,
	"start_date" date NOT NULL,
	"operational_at" timestamp with time zone,
	"financially_closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"category" "product_category" NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"unit_cost_paise" bigint NOT NULL,
	"tax_rate_bp" integer NOT NULL,
	"basis" "quantity_basis" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"contingency_paise" bigint NOT NULL,
	"discount_paise" bigint NOT NULL,
	"tax_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"cost_paise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"previous_quotation_id" uuid,
	"lead_id" uuid,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"subsidy_category" "subsidy_category" NOT NULL,
	"system_type" "system_type" DEFAULT 'on_grid' NOT NULL,
	"target_wp" integer NOT NULL,
	"capacity_wp" integer NOT NULL,
	"module_count" integer NOT NULL,
	"panel_product_id" uuid NOT NULL,
	"inverter_product_id" uuid NOT NULL,
	"battery_product_id" uuid,
	"structure_type" "structure_type" NOT NULL,
	"floors" integer NOT NULL,
	"distance_km" integer DEFAULT 0 NOT NULL,
	"dc_cable_meters" double precision,
	"ac_cable_meters" double precision,
	"contingency_bp" integer NOT NULL,
	"tolerance_bp" integer NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"discount_approved_by_user_id" uuid,
	"subtotal_paise" bigint NOT NULL,
	"contingency_paise" bigint NOT NULL,
	"tax_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"cost_paise" bigint NOT NULL,
	"margin_paise" bigint NOT NULL,
	"subsidy_paise" bigint NOT NULL,
	"subsidy_ineligible" text,
	"effective_paise" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"valid_until" date NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"customer_id" uuid,
	"task_id" uuid,
	"category" text NOT NULL,
	"source" "document_source" NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"report_key" text,
	"replaced_at" timestamp with time zone,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "outbox_channel" NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_reseller_user_id_users_id_fk" FOREIGN KEY ("reseller_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_discom_id_discoms_id_fk" FOREIGN KEY ("discom_id") REFERENCES "public"."discoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_party_user_id_users_id_fk" FOREIGN KEY ("party_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_facts" ADD CONSTRAINT "project_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_facts" ADD CONSTRAINT "project_facts_captured_by_task_id_project_tasks_id_fk" FOREIGN KEY ("captured_by_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_discom_id_discoms_id_fk" FOREIGN KEY ("discom_id") REFERENCES "public"."discoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_project_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_previous_quotation_id_quotations_id_fk" FOREIGN KEY ("previous_quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_panel_product_id_products_id_fk" FOREIGN KEY ("panel_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_inverter_product_id_products_id_fk" FOREIGN KEY ("inverter_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_battery_product_id_products_id_fk" FOREIGN KEY ("battery_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_discount_approved_by_user_id_users_id_fk" FOREIGN KEY ("discount_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discoms_code_unique" ON "discoms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "task_templates_key_unique" ON "task_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "properties_customer_idx" ON "properties" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payables_due_idx" ON "payables" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "payment_milestones_project_idx" ON "payment_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_project_idx" ON "payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_employee_code_unique" ON "users" USING btree ("employee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "project_activities_project_idx" ON "project_activities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_assignee_idx" ON "project_tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_unique" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "projects_customer_idx" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotation_lines_quotation_idx" ON "quotation_lines" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_revision_unique" ON "quotations" USING btree ("number","revision");--> statement-breakpoint
CREATE INDEX "quotations_customer_idx" ON "quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotations_lead_idx" ON "quotations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "outbox" USING btree ("status");