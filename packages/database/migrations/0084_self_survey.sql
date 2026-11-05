CREATE TABLE "milestone_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid NOT NULL,
	"applied_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reverse_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestone_credits" ADD CONSTRAINT "milestone_credits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_credits" ADD CONSTRAINT "milestone_credits_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_credits" ADD CONSTRAINT "milestone_credits_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_credits" ADD CONSTRAINT "milestone_credits_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestone_credits_milestone_idx" ON "milestone_credits" USING btree ("milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_credits_live_unique" ON "milestone_credits" USING btree ("source","source_id") WHERE "milestone_credits"."reversed_at" is null;--> statement-breakpoint
-- Self site survey (phase 5): the offer, reminder and approval templates, off until Meta approves them (en, mr, hi); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('self_survey_offer', 'customer', 'self_survey_offer', ARRAY['customer','home','amount'], 'Hello {{1}}, do your own site survey for your {{2}} solar in 5 minutes and get {{3}} off your next payment. Our engineer checks your photos - no visit needed.', false),
('self_survey_reminder', 'customer', 'self_survey_reminder', ARRAY['customer','home'], 'Hello {{1}}, a reminder: your site survey for your {{2}} solar is not finished yet. It takes about 5 minutes. Tap the button to continue.', false),
('self_survey_approved', 'customer', 'self_survey_approved', ARRAY['customer','home','amount'], 'Hello {{1}}, your site survey for your {{2}} solar is approved. {{3}}', false)
ON CONFLICT ("key") DO NOTHING;
