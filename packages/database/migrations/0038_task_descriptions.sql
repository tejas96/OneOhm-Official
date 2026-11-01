-- The library's plain description for each task (PRD 3.7), on templates and on tasks already
-- made from them. Only empty descriptions are filled; anything an owner wrote stays.
UPDATE "task_templates" AS t SET "description" = d.description
FROM (VALUES
  ('site_survey', 'Visit the site, measure the roof and cable runs, check shade and structure, and take photos.'),
  ('electricity_details', 'Check the latest bill: consumer number, meter holder name and sanctioned load must match.'),
  ('society_documents', 'Collect the society NOC, committee resolution and common-meter documents before applying.'),
  ('name_change', 'Get the electricity connection moved into the customer’s name with MSEDCL.'),
  ('system_design', 'Prepare the panel layout and system design from the survey and get it approved.'),
  ('loan_documents', 'Collect the documents the bank needs from the customer and check they are clear.'),
  ('loan_submission', 'Submit the complete loan file to the bank and note the reference number.'),
  ('loan_approval', 'Follow up with the bank until the loan is sanctioned and record the amount.'),
  ('discom_application', 'Apply for net metering on the MSEDCL portal and save the application number.'),
  ('discom_sanction', 'Follow up with MSEDCL until net metering is sanctioned and attach the letter.'),
  ('purchase_order', 'Raise purchase orders for the panels and inverter in the approved design.'),
  ('battery_procurement', 'Order the battery, check it on arrival and keep the test report.'),
  ('material_reservation', 'Reserve this project’s material in the store and inspect it for damage.'),
  ('dispatch_material', 'Load and send the material to site, and get the delivery signed.'),
  ('ground_foundation', 'Mark out and cast the ground-mount foundations as per the layout.'),
  ('structure_installation', 'Fix the mounting structure level and secure, as per the layout.'),
  ('panel_installation', 'Mount the panels, connect the strings and record every serial number.'),
  ('inverter_installation', 'Install the inverter and complete the DC and AC wiring neatly.'),
  ('battery_installation', 'Install the battery, connect it to the inverter and test backup.'),
  ('earthing_protection', 'Install earthing pits, the lightning arrester and protection devices.'),
  ('installation_complete', 'Walk the full installation, fix any gaps and sign it off.'),
  ('dcr_undertaking', 'Get the DCR undertaking signed for the subsidy claim.'),
  ('testing_commissioning', 'Switch the system on, test generation and record the readings.'),
  ('loan_disbursement_claim', 'Send the bank the completion proof and claim the disbursement.'),
  ('generation_meter_test', 'Get the generation meter tested with MSEDCL and keep the report.'),
  ('discom_inspection', 'Be on site for the DISCOM inspection and record the outcome.'),
  ('net_meter_installation', 'Confirm MSEDCL has installed the net meter and note its number.'),
  ('handover', 'Explain the system to the customer, hand over warranty documents and get their signature.'),
  ('subsidy_application', 'Apply on the PM Surya Ghar portal with the completion documents.'),
  ('subsidy_release', 'Follow up until the subsidy reaches the customer’s bank account.')
) AS d(key, description)
WHERE t."key" = d.key AND t."description" IS NULL;
--> statement-breakpoint
UPDATE "project_tasks" AS p SET "description" = t."description"
FROM "task_templates" AS t
WHERE t."key" = p."template_key" AND p."description" IS NULL AND t."description" IS NOT NULL;
