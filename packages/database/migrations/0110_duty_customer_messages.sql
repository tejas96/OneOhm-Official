ALTER TABLE "site_visits" ADD COLUMN "customer_said" text;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "customer_said_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "customer_check_due_at" timestamp with time zone;--> statement-breakpoint
-- Customer messages of a site visit (Duty Day step 6): off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('worker_on_way', 'customer', 'worker_on_way', ARRAY['customer','worker','home','minutes'], 'Hello {{1}}, {{2}} from OneOhm is on the way to {{3}}. Expected in about {{4}} min.', false),
('worker_arrived', 'customer', 'worker_arrived', ARRAY['customer','worker','home'], 'Hello {{1}}, {{2}} from OneOhm has reached {{3}}.', false),
('visit_check', 'customer', 'visit_check', ARRAY['customer','worker','home'], 'Hello {{1}}, {{2}} from OneOhm visited {{3}} today. Was this visit done?', false),
('visit_delayed', 'customer', 'visit_delayed', ARRAY['customer','home'], 'Hello {{1}}, our team is running late for your visit to {{2}}. We will update you soon.', false)
ON CONFLICT ("key") DO NOTHING;
