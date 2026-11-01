-- A survey per kind of site, verified by a manager before the budget locks (PRD 3.4), and
-- critical tasks that a manager confirms (PRD 3.8). The new templates come from the seed;
-- these update the shipped rows once, and only where an owner has not changed them.
UPDATE "task_templates" SET "approval" = true WHERE "key" = 'site_survey';
--> statement-breakpoint
UPDATE "task_templates"
SET "conditions" = '{"projectTypes":["residential"],"groundMount":false}'::jsonb
WHERE "key" = 'site_survey' AND "conditions" IS NULL;
--> statement-breakpoint
UPDATE "task_templates"
SET "depends_on" = ARRAY['site_survey', 'site_survey_society', 'site_survey_commercial', 'site_survey_ground']
WHERE "key" = 'system_design' AND "depends_on" = ARRAY['site_survey'];
--> statement-breakpoint
UPDATE "task_templates"
SET "depends_on" = ARRAY['installation_complete', 'electrical_inspection']
WHERE "key" = 'testing_commissioning' AND "depends_on" = ARRAY['installation_complete'];
--> statement-breakpoint
UPDATE "task_templates" SET "confirm_assignee" = true
WHERE "key" IN ('testing_commissioning', 'ground_foundation');
--> statement-breakpoint
-- Surveys not yet sent in on live projects also wait for a manager's approval now.
UPDATE "project_tasks" SET "approval" = true
WHERE "template_key" = 'site_survey' AND "status" IN ('pending', 'ready', 'in_progress', 'waiting');
