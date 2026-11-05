-- New customer templates for the subsidy, loan and layout steps: off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('subsidy_register_help', 'customer', 'subsidy_register_help', ARRAY['customer','home'], 'Hello {{1}}, please register on the PM Surya Ghar portal (pmsuryaghar.gov.in) for your {{2}} solar. It takes about 5 minutes. Keep your latest electricity bill (consumer number, electricity company) and an email ID ready. Tell us when it is done, or ask for help.', false),
('subsidy_credit_check', 'customer', 'subsidy_credit_check', ARRAY['customer','amount','home'], 'Hello {{1}}, did the {{2}} subsidy for your {{3}} solar reach your bank account?', false),
('bank_sign_visit', 'customer', 'bank_sign_visit', ARRAY['customer','bank','branch','day'], 'Hello {{1}}, please visit {{2}}, {{3}} on {{4}} to sign the loan papers for your solar.', false),
('layout_approval', 'customer', 'layout_approval', ARRAY['customer','home'], 'Hello {{1}}, here is how the panels will sit on your {{2}} roof. Tap Looks good if you are happy, or ask us if you have a question.', false),
('layout_reminder', 'customer', 'layout_reminder', ARRAY['customer','home'], 'Hello {{1}}, a reminder: please look at how the panels will sit on your {{2}} roof and tell us if it looks good. Tap the button to see it again.', false),
('loan_sanctioned', 'customer', 'loan_sanctioned', ARRAY['customer','amount','bank'], 'Hello {{1}}, good news: your loan of {{2}} is sanctioned by {{3}}. We will guide you on the next steps.', false),
('loan_disbursed', 'customer', 'loan_disbursed', ARRAY['customer','amount','bank'], 'Hello {{1}}, {{2}} was sent by {{3}} for your solar. Thank you.', false),
('loan_rejected', 'customer', 'loan_rejected', ARRAY['customer','bank','staff'], 'Hello {{1}}, {{2}} did not approve the loan. {{3}} will call you to plan the next steps.', false)
ON CONFLICT ("key") DO NOTHING;
