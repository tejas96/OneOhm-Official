CREATE TABLE "lead_campaigns" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "campaign_code" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_headline" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_source_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "landing_page" text;