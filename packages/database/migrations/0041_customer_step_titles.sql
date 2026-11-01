-- Customers never see internal task wording (PRD 5.2, 6.2): steps that message or show to
-- customers get the customer app's words. Owners' own titles are kept.
UPDATE "task_templates" AS t SET "customer_title" = v.title, "updated_at" = now()
FROM (VALUES
  ('site_survey', 'Site visit and roof measurements'),
  ('site_survey_society', 'Site visit and roof measurements'),
  ('site_survey_commercial', 'Site visit and roof measurements'),
  ('site_survey_ground', 'Site visit and land measurements'),
  ('name_change', 'Electricity connection name change'),
  ('system_design', 'Your system design is approved'),
  ('loan_approval', 'Bank loan sanctioned'),
  ('discom_application', 'Net-meter application filed with the electricity board'),
  ('dispatch_material', 'Equipment on its way to your home'),
  ('structure_installation', 'Mounting structure fitted'),
  ('installation_complete', 'Installation finished and checked'),
  ('testing_commissioning', 'System tested and switched on'),
  ('discom_inspection', 'Electricity board inspection'),
  ('net_meter_installation', 'Net meter fitted'),
  ('handover', 'Handover and warranty papers'),
  ('subsidy_application', 'Subsidy applied on the PM Surya Ghar portal'),
  ('subsidy_release', 'Subsidy released to your bank account')
) AS v(key, title)
WHERE t."key" = v.key AND coalesce(trim(t."customer_title"), '') = '';--> statement-breakpoint
-- Installation tells the customer when it starts (PRD 6.2 "installation started"),
-- unless the owner already changed this step's message.
UPDATE "task_templates" SET "notify_event" = 'started', "message_key" = 'installation_started', "updated_at" = now()
WHERE "key" = 'structure_installation' AND "notify_event" = 'completed' AND "message_key" = 'project_milestone';--> statement-breakpoint
-- Switch-on says the final payment is now due (PRD 6.2 "commissioning completed (final payment due)").
UPDATE "task_templates" SET "message_key" = 'commissioning_completed', "updated_at" = now()
WHERE "key" = 'testing_commissioning' AND "message_key" = 'project_milestone';
