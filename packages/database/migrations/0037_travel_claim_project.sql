CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience_role_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"ends_on" date,
	"created_by_user_id" uuid,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_work_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"open_task_limit" integer,
	"tracking" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_bonus_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bonus_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shares" integer DEFAULT 1 NOT NULL,
	"amount_paise" bigint NOT NULL,
	"payable_id" uuid
);
--> statement-breakpoint
CREATE TABLE "project_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"reason" text NOT NULL,
	"total_paise" bigint NOT NULL,
	"status" "decision_status" DEFAULT 'pending' NOT NULL,
	"proposed_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"battery_percent" integer,
	"charging" boolean,
	"network" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_policy" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"manager_after_days" integer NOT NULL,
	"owners_after_days" integer NOT NULL,
	"stuck_internal_days" integer NOT NULL,
	"stuck_outside_days" integer NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_contractors" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"contractor_id" uuid NOT NULL,
	"chosen_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_team_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "reviewer" text DEFAULT 'approvers' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "confirm_assignee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "escalate_after_days" integer;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "vendor_invoice_paise" bigint;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "gst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "tds_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "tds_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tds_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "dcr_certificate_document_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "proposed_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "outside_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "reviewer" text DEFAULT 'approvers' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_finish_date" date;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD COLUMN "auto_from_site" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "handover_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_work_settings" ADD CONSTRAINT "person_work_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonus_shares" ADD CONSTRAINT "project_bonus_shares_bonus_id_project_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."project_bonuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonus_shares" ADD CONSTRAINT "project_bonus_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonus_shares" ADD CONSTRAINT "project_bonus_shares_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonuses" ADD CONSTRAINT "project_bonuses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonuses" ADD CONSTRAINT "project_bonuses_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_bonuses" ADD CONSTRAINT "project_bonuses_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_conditions" ADD CONSTRAINT "reading_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_policy" ADD CONSTRAINT "escalation_policy_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_chosen_by_user_id_users_id_fk" FOREIGN KEY ("chosen_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_created_idx" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_bonus_shares_unique" ON "project_bonus_shares" USING btree ("bonus_id","user_id");--> statement-breakpoint
CREATE INDEX "project_bonus_shares_user_idx" ON "project_bonus_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_bonuses_status_idx" ON "project_bonuses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_conditions_subject_unique" ON "reading_conditions" USING btree ("subject_id","kind");--> statement-breakpoint
CREATE INDEX "project_contractors_contractor_idx" ON "project_contractors" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "project_team_members_user_idx" ON "project_team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_reviews_task_idx" ON "task_reviews" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_dcr_certificate_document_id_documents_id_fk" FOREIGN KEY ("dcr_certificate_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_proposed_user_id_users_id_fk" FOREIGN KEY ("proposed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_claims_project_idx" ON "travel_claims" USING btree ("project_id");