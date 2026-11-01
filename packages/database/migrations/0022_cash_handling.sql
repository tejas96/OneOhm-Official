CREATE TYPE "public"."payment_handling_status" AS ENUM('in_hand', 'deposited', 'cleared', 'bounced');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'cash_deposit' BEFORE 'referral_reward_approved';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'cheque_cleared' BEFORE 'referral_reward_approved';--> statement-breakpoint
CREATE TABLE "money_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"deposited_on" date NOT NULL,
	"bank_reference" text,
	"cash_paise" bigint DEFAULT 0 NOT NULL,
	"cheque_paise" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"deposited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_handling" (
	"payment_id" uuid PRIMARY KEY NOT NULL,
	"collected_by_user_id" uuid,
	"cheque_number" text,
	"cheque_bank" text,
	"cheque_date" date,
	"status" "payment_handling_status" DEFAULT 'in_hand' NOT NULL,
	"deposit_id" uuid,
	"cleared_on" date,
	"bounced_on" date,
	"bounce_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_deposits" ADD CONSTRAINT "money_deposits_deposited_by_user_id_users_id_fk" FOREIGN KEY ("deposited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_handling" ADD CONSTRAINT "payment_handling_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_handling" ADD CONSTRAINT "payment_handling_collected_by_user_id_users_id_fk" FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_handling" ADD CONSTRAINT "payment_handling_deposit_id_money_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."money_deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_deposits_number_unique" ON "money_deposits" USING btree ("number");--> statement-breakpoint
CREATE INDEX "payment_handling_status_idx" ON "payment_handling" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_handling_deposit_idx" ON "payment_handling" USING btree ("deposit_id");--> statement-breakpoint
-- Payments recorded before this change (PRD 3.11): cash is still in hand with whoever
-- recorded it; cheques were already booked in the bank, so they count as cleared.
INSERT INTO "payment_handling" ("payment_id", "collected_by_user_id", "status", "cleared_on")
SELECT p."id",
  p."recorded_by_user_id",
  CASE WHEN p."method" = 'cheque' THEN 'cleared'::"payment_handling_status" ELSE 'in_hand'::"payment_handling_status" END,
  CASE WHEN p."method" = 'cheque' THEN p."received_on" ELSE NULL END
FROM "payments" p
WHERE p."method" IN ('cash', 'cheque')
  AND p."amount_paise" > 0
  AND p."reverses_payment_id" IS NULL
  AND p."paid_from_credit" = false
  AND NOT EXISTS (SELECT 1 FROM "payments" r WHERE r."reverses_payment_id" = p."id")
ON CONFLICT DO NOTHING;
