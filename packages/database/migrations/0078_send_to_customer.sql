ALTER TYPE "public"."location_source" ADD VALUE 'whatsapp_pin';
--> statement-breakpoint
-- New customer templates for the "Send to customer" menu: off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('location_request', 'customer', 'location_request', ARRAY['customer','home'], 'Hello {{1}}, please share the location of your {{2}} home so our team finds it easily. Tap the button below to send it.', false),
('payment_due', 'customer', 'payment_due', ARRAY['customer','amount','home'], 'Hello {{1}}, {{2}} is due for your {{3}} home. You can pay online, or tell us if you have already paid another way.', false),
('callback_request', 'customer', 'callback_request', ARRAY['customer','staff'], 'Hello {{1}}, when should {{2}} from OneOhm call you? Pick a time below.', false),
('delay_notice', 'customer', 'delay_notice', ARRAY['customer','stage','reason'], 'Hello {{1}}, your {{2}} is waiting: {{3}}. We will update you here.', false),
('crew_contact', 'customer', 'crew_contact', ARRAY['customer','staff','work','phone'], 'Hello {{1}}, {{2}} from OneOhm will come for your {{3}}. You can call them on {{4}}.', false),
('document_share', 'customer', 'document_share', ARRAY['customer','document'], 'Hello {{1}}, here is your {{2}} from OneOhm. Reply here if you have any questions.', false)
ON CONFLICT ("key") DO NOTHING;
