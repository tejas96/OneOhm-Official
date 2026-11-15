ALTER TYPE "public"."lead_source" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'google';--> statement-breakpoint
ALTER TYPE "public"."outbox_channel" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TYPE "public"."outbox_channel" ADD VALUE 'messenger';--> statement-breakpoint
CREATE TABLE "marketing_ads" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"review_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_ads_provider_external_id_pk" PRIMARY KEY("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"state" text DEFAULT 'launching' NOT NULL,
	"text" text NOT NULL,
	"media_id" uuid,
	"channels" text[] NOT NULL,
	"city" text NOT NULL,
	"daily_budget_paise" bigint DEFAULT 0 NOT NULL,
	"segments" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_at" timestamp with time zone,
	"copied_from_id" uuid,
	"last_error" text,
	"created_by_user_id" uuid,
	"launched_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"secrets" text,
	"account_id" text,
	"account_name" text,
	"currency" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing" text[] DEFAULT '{}'::text[] NOT NULL,
	"token_expires_at" timestamp with time zone,
	"last_error" text,
	"balance_paise" bigint,
	"balance_checked_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"connected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_budget_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_spend_days" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"day" date NOT NULL,
	"campaign_id" uuid,
	"spend_paise" bigint DEFAULT 0 NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_spend_days_provider_external_id_day_pk" PRIMARY KEY("provider","external_id","day")
);
--> statement-breakpoint
CREATE TABLE "marketing_audience_members" (
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_audience_members_provider_kind_hash_pk" PRIMARY KEY("provider","kind","hash")
);
--> statement-breakpoint
CREATE TABLE "marketing_audiences" (
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text,
	"size" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	CONSTRAINT "marketing_audiences_provider_kind_pk" PRIMARY KEY("provider","kind")
);
--> statement-breakpoint
CREATE TABLE "marketing_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"campaign_id" uuid,
	"gclid" text,
	"fbclid" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"event" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"value_paise" bigint,
	"event_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_events" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_jobs" (
	"key" text PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"segment" text NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"outbox_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_review_requests" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"outbox_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"author" text NOT NULL,
	"rating" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ctwa_clid" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "platform_lead_id" text;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD COLUMN "channel" text DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_ads" ADD CONSTRAINT "marketing_ads_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_code_lead_campaigns_code_fk" FOREIGN KEY ("code") REFERENCES "public"."lead_campaigns"("code") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_media_id_marketing_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."marketing_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_connections" ADD CONSTRAINT "marketing_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_media" ADD CONSTRAINT "marketing_media_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_placements" ADD CONSTRAINT "marketing_placements_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_spend_days" ADD CONSTRAINT "marketing_spend_days_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_clicks" ADD CONSTRAINT "marketing_clicks_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_clicks" ADD CONSTRAINT "marketing_clicks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_messages" ADD CONSTRAINT "marketing_messages_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_messages" ADD CONSTRAINT "marketing_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_messages" ADD CONSTRAINT "marketing_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_messages" ADD CONSTRAINT "marketing_messages_outbox_id_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_review_requests" ADD CONSTRAINT "marketing_review_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_review_requests" ADD CONSTRAINT "marketing_review_requests_outbox_id_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_ads_campaign_idx" ON "marketing_ads" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_campaigns_code_unique" ON "marketing_campaigns" USING btree ("code");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_state_idx" ON "marketing_campaigns" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_placements_campaign_provider_unique" ON "marketing_placements" USING btree ("campaign_id","provider");--> statement-breakpoint
CREATE INDEX "marketing_spend_days_campaign_idx" ON "marketing_spend_days" USING btree ("campaign_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_clicks_ref_unique" ON "marketing_clicks" USING btree ("ref");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_conversions_unique" ON "marketing_conversions" USING btree ("lead_id","event","provider");--> statement-breakpoint
CREATE INDEX "marketing_conversions_status_idx" ON "marketing_conversions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_messages_campaign_phone_unique" ON "marketing_messages" USING btree ("campaign_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_reviews_external_unique" ON "marketing_reviews" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_platform_lead_unique" ON "leads" USING btree ("platform_lead_id") WHERE "leads"."platform_lead_id" is not null;--> statement-breakpoint
CREATE INDEX "leads_campaign_code_idx" ON "leads" USING btree ("campaign_code");--> statement-breakpoint
-- Marketing rights: the Marketing role, and anyone who could change Settings (they kept the ad codes and referrals there).
INSERT INTO "role_capabilities" ("role_id", "capability")
SELECT r."id", 'marketing.manage'
FROM "roles" r
WHERE r."kind" = 'staff' AND (
    r."key" = 'marketing'
    OR EXISTS (
      SELECT 1 FROM "role_capabilities" rc
      WHERE rc."role_id" = r."id" AND rc."capability" = 'settings.manage'
    )
  )
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Marketing WhatsApp messages: off until Meta approves them (Marketing sends them for approval); a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES
('offer_quote_follow_up', 'customer', 'offer_quote_follow_up', ARRAY['customer','company','message'], 'Hello {{1}}, your solar quotation from {{2}} is still open. {{3}} Reply here and we will help you choose. Reply STOP to stop these messages.', false),
('offer_revisit', 'customer', 'offer_revisit', ARRAY['customer','company','message'], 'Hello {{1}}, {{2}} here. Solar prices and subsidy have changed since we last spoke. {{3}} Reply YES and we will call you. Reply STOP to stop these messages.', false),
('offer_past_customer', 'customer', 'offer_past_customer', ARRAY['customer','company','message'], 'Hello {{1}}, thank you for choosing {{2}} for your solar. {{3}} Reply here to know more. Reply STOP to stop these messages.', false),
('review_request', 'customer', 'review_request', ARRAY['customer','company','link'], 'Hello {{1}}, your solar system from {{2}} is working. Could you spare one minute to rate us on Google? It helps other families choose solar: {{3}}', false)
ON CONFLICT ("key") DO NOTHING;
