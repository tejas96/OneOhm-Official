-- Reminder templates for journey steps (paper to agree to, roof not ready yet): off until Meta approves them (en, mr, hi).
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('signature_reminder', 'customer', 'signature_reminder', ARRAY['customer','document','home'], 'Hello {{1}}, a reminder: please read your {{2}} for {{3}} and tell us if you agree. Tap the button to see it again.', false),
('site_ready_reminder', 'customer', 'site_ready_reminder', ARRAY['customer','home'], 'Hello {{1}}, we are waiting for the roof at {{2}} to be ready for installation. Tap the button when it is ready.', false)
ON CONFLICT ("key") DO NOTHING;
