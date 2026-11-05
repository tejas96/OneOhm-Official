ALTER TABLE "bank_payouts" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "payee_told" text;
--> statement-breakpoint
-- Payee message after a bank transfer is paid: off until Meta approves it and the owner switches it on; a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('vendor_paid', 'vendor', 'vendor_paid', ARRAY['payee','amount','company','utr','date','last4'], 'Hello {{1}}, {{3}} has paid you {{2}} by bank transfer on {{5}}. Bank reference (UTR): {{4}}. It went to the account ending {{6}}.', false)
ON CONFLICT ("key") DO NOTHING;
