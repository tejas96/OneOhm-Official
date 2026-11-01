CREATE TYPE "public"."payment_link_status" AS ENUM('created', 'partly_paid', 'paid', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'gateway_fee';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'settlement';--> statement-breakpoint
CREATE TABLE "gateway_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "gateway_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_settlement_id" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"fees_paise" bigint DEFAULT 0 NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"utr" text,
	"settled_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_settlements_provider_settlement_id_unique" UNIQUE("provider_settlement_id")
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"milestone_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_link_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"url" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"status" "payment_link_status" DEFAULT 'created' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_provider_link_id_unique" UNIQUE("provider_link_id"),
	CONSTRAINT "payment_links_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_payment_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_fee_paise" bigint;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_links_milestone_idx" ON "payment_links" USING btree ("milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_payment_unique" ON "payments" USING btree ("gateway_payment_id");