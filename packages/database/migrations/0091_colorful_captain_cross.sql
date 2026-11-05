ALTER TYPE "public"."journal_source" ADD VALUE 'payout_fee_refund' BEFORE 'payout_paid';--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "fee_tax_paise" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- GST input credit account, for the GST inside RazorpayX fees; a row already there is kept.
INSERT INTO "ledger_accounts" ("code", "name", "type") VALUES ('1310', 'GST input credit', 'asset') ON CONFLICT ("code") DO NOTHING;
