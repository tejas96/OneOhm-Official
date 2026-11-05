-- New customer templates for journey steps (signature, roof ready, installation finished, handover pack):
-- off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('signature_request', 'customer', 'signature_request', ARRAY['customer','document','home'], 'Hello {{1}}, please read your {{2}} for {{3}}. Tap I agree if you accept it, or ask us if you have a question.', false),
('site_ready_check', 'customer', 'site_ready_check', ARRAY['customer','home'], 'Hello {{1}}, is the roof at {{2}} ready for installation? It needs a clear roof, a power point and someone at home.', false),
('installation_check', 'customer', 'installation_check', ARRAY['customer','home'], 'Hello {{1}}, is the installation at {{2}} finished to your satisfaction?', false),
('handover_pack', 'customer', 'handover_pack', ARRAY['customer','count','home'], 'Hello {{1}}, your {{2}} handover papers for {{3}} are ready. Tap Documents to receive them here.', false)
ON CONFLICT ("key") DO NOTHING;
