CREATE TYPE "public"."payout_status" AS ENUM('queued', 'pending', 'processing', 'processed', 'reversed', 'failed', 'cancelled', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'payout_fee' BEFORE 'referral_reward_approved';--> statement-breakpoint
CREATE TABLE "bank_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payable_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payout_id" text,
	"fund_account_id" text NOT NULL,
	"mode" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"fee_paise" bigint DEFAULT 0 NOT NULL,
	"status" "payout_status" DEFAULT 'queued' NOT NULL,
	"utr" text,
	"failure_reason" text,
	"account_masked" text NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payee_kind" text NOT NULL,
	"payee_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"contact_id" text NOT NULL,
	"fund_account_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_payouts_payable_idx" ON "bank_payouts" USING btree ("payable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_payouts_provider_unique" ON "bank_payouts" USING btree ("provider_payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_payee_unique" ON "payout_accounts" USING btree ("payee_kind","payee_id","provider","fingerprint");