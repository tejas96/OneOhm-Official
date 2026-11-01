CREATE TYPE "public"."journal_source" AS ENUM('milestone_due', 'advance_applied', 'payment', 'payable_approved', 'payable_paid', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('collecting_documents', 'submitted', 'sanctioned', 'disbursing', 'disbursed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."loan_tranche_status" AS ENUM('planned', 'claimed', 'received');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "journal_entries_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_date" date NOT NULL,
	"memo" text NOT NULL,
	"source_type" "journal_source" NOT NULL,
	"source_id" text NOT NULL,
	"project_id" uuid,
	"reverses_entry_id" uuid,
	"posted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"debit_paise" bigint DEFAULT 0 NOT NULL,
	"credit_paise" bigint DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "journal_lines_one_sided" CHECK (("journal_lines"."debit_paise" > 0 and "journal_lines"."credit_paise" = 0) or ("journal_lines"."credit_paise" > 0 and "journal_lines"."debit_paise" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lending_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"required_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disbursement" text DEFAULT 'single' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_tranches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"expected_on" date,
	"status" "loan_tranche_status" DEFAULT 'planned' NOT NULL,
	"claimed_on" date,
	"payment_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lending_partner_id" uuid,
	"lender_name" text NOT NULL,
	"application_number" text,
	"sanctioned_paise" bigint,
	"sanctioned_on" date,
	"status" "loan_status" DEFAULT 'collecting_documents' NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "bill_number" text;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "paid_method" "payment_method";--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "paid_reference" text;--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "paid_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reverses_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_code_ledger_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."ledger_accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_tranches" ADD CONSTRAINT "loan_tranches_loan_id_project_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."project_loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_tranches" ADD CONSTRAINT "loan_tranches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_loans" ADD CONSTRAINT "project_loans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_loans" ADD CONSTRAINT "project_loans_lending_partner_id_lending_partners_id_fk" FOREIGN KEY ("lending_partner_id") REFERENCES "public"."lending_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_loans" ADD CONSTRAINT "project_loans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_unique" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_project_idx" ON "journal_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_code");--> statement-breakpoint
CREATE UNIQUE INDEX "lending_partners_name_unique" ON "lending_partners" USING btree ("name");--> statement-breakpoint
CREATE INDEX "loan_tranches_loan_idx" ON "loan_tranches" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_loans_project_unique" ON "project_loans" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reverses_payment_id_payments_id_fk" FOREIGN KEY ("reverses_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reversal_unique" ON "payments" USING btree ("reverses_payment_id");