CREATE TYPE "public"."commission_basis" AS ENUM('percent', 'per_kw');--> statement-breakpoint
CREATE TYPE "public"."incentive_status" AS ENUM('pending', 'approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."qualifying_event" AS ENUM('project_created', 'advance_paid', 'commissioned');--> statement-breakpoint
CREATE TYPE "public"."referral_reward_basis" AS ENUM('per_referral', 'per_kw');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'referral_reward_approved';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'referral_reward_paid';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'commission_approved';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'commission_paid';--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_user_id" uuid NOT NULL,
	"lead_id" uuid,
	"project_id" uuid NOT NULL,
	"status" "incentive_status" DEFAULT 'pending' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"basis" "commission_basis" NOT NULL,
	"rate_bp" integer NOT NULL,
	"per_kw_paise" bigint NOT NULL,
	"project_value_paise" bigint NOT NULL,
	"capacity_wp" integer NOT NULL,
	"qualifying_event" "qualifying_event" NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"reject_reason" text,
	"paid_at" timestamp with time zone,
	"paid_on" date,
	"paid_method" "payment_method",
	"paid_reference" text,
	"paid_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_user_id" uuid,
	"basis" "commission_basis" DEFAULT 'percent' NOT NULL,
	"rate_bp" integer DEFAULT 0 NOT NULL,
	"per_kw_paise" bigint DEFAULT 0 NOT NULL,
	"qualifying_event" "qualifying_event" DEFAULT 'advance_paid' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_reseller_unique" UNIQUE NULLS NOT DISTINCT("reseller_user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"basis" "referral_reward_basis" DEFAULT 'per_referral' NOT NULL,
	"amount_paise" bigint DEFAULT 0 NOT NULL,
	"qualifying_event" "qualifying_event" DEFAULT 'advance_paid' NOT NULL,
	"starts_on" date NOT NULL,
	"budget_paise" bigint,
	"per_customer_count" integer,
	"per_customer_paise" bigint,
	"eligible_types" "project_type"[] NOT NULL,
	"share_number_e164" text,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"referrer_customer_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "incentive_status" DEFAULT 'pending' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"basis" "referral_reward_basis" NOT NULL,
	"rate_paise" bigint NOT NULL,
	"capacity_wp" integer NOT NULL,
	"qualifying_event" "qualifying_event" NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"reject_reason" text,
	"paid_at" timestamp with time zone,
	"paid_on" date,
	"paid_method" "payment_method",
	"paid_reference" text,
	"paid_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_reseller_user_id_users_id_fk" FOREIGN KEY ("reseller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_reseller_user_id_users_id_fk" FOREIGN KEY ("reseller_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_project_unique" ON "commission_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "commission_entries_reseller_idx" ON "commission_entries" USING btree ("reseller_user_id");--> statement-breakpoint
CREATE INDEX "commission_entries_status_idx" ON "commission_entries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_lead_unique" ON "referral_rewards" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "referral_rewards_referrer_idx" ON "referral_rewards" USING btree ("referrer_customer_id");--> statement-breakpoint
CREATE INDEX "referral_rewards_status_idx" ON "referral_rewards" USING btree ("status");