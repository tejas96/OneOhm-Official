ALTER TABLE "customers" ADD COLUMN "upi_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "upi_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "upi_checked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "reopen_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "reopened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD COLUMN "paid_upi_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_upi_checked_by_user_id_users_id_fk" FOREIGN KEY ("upi_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_actions_once_unique" ON "customer_actions" USING btree (("payload"->>'once')) WHERE "customer_actions"."payload"->>'once' is not null and "customer_actions"."status" <> 'cancelled';--> statement-breakpoint
-- Phase 6 (problems, ratings, referral payout, AMC): the new templates, off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('problem_fixed_check', 'customer', 'problem_fixed_check', ARRAY['customer','topic'], 'Hello {{1}}, we have fixed "{{2}}". Is it working now? Tap a button to tell us.', false),
('reward_upi_ask', 'customer', 'reward_upi_ask', ARRAY['customer','amount'], 'Hello {{1}}, your OneOhm referral reward of {{2}} is approved. Share your UPI ID to receive it.', false),
('amc_renewal_offer', 'customer', 'amc_renewal_offer', ARRAY['customer','home','date'], 'Hello {{1}}, the annual maintenance plan for your {{2}} solar ends on {{3}}. Renew it to keep your free visits and cleaning.', false)
ON CONFLICT ("key") DO NOTHING;
