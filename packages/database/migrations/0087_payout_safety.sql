ALTER TYPE "public"."journal_source" ADD VALUE 'payout_paid' BEFORE 'referral_reward_approved';--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "stuck_alerted_at" timestamp with time zone;