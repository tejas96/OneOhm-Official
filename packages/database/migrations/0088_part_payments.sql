ALTER TYPE "public"."journal_source" ADD VALUE 'payable_payment' BEFORE 'referral_reward_approved';--> statement-breakpoint
CREATE TABLE "payable_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payable_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"bank_payout_id" uuid,
	"paid_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"from_old_bill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "paid_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_bank_payout_id_bank_payouts_id_fk" FOREIGN KEY ("bank_payout_id") REFERENCES "public"."bank_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payable_payments_payable_idx" ON "payable_payments" USING btree ("payable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payable_payments_payout_unique" ON "payable_payments" USING btree ("bank_payout_id") WHERE "payable_payments"."bank_payout_id" is not null;--> statement-breakpoint
-- Old paid bills each get one payment row for what was paid out. Nothing is changed or
-- deleted: amounts and journal entries stay as they are, and no entry is posted for these
-- rows (their money is already booked under the bill's own "bill paid" entry).
INSERT INTO "payable_payments" ("payable_id", "amount_paise", "method", "paid_on", "reference", "bank_payout_id", "paid_by_user_id", "from_old_bill", "created_at")
SELECT
	p."id",
	GREATEST(0, p."amount_paise" - p."tds_paise" - p."advance_adjusted_paise"),
	COALESCE(p."paid_method", 'bank_transfer'::"payment_method"),
	COALESCE(p."paid_on", p."paid_at"::date, p."updated_at"::date),
	p."paid_reference",
	(SELECT CASE WHEN count(*) = 1 THEN (array_agg(b."id"))[1] END
	   FROM "bank_payouts" b WHERE b."payable_id" = p."id" AND b."status" = 'processed'),
	p."paid_by_user_id",
	true,
	COALESCE(p."paid_at", p."updated_at")
FROM "payables" p
WHERE p."status" = 'paid';
--> statement-breakpoint
UPDATE "payables" p
SET "paid_paise" = pp."amount_paise"
FROM "payable_payments" pp
WHERE pp."payable_id" = p."id" AND pp."from_old_bill" = true;
