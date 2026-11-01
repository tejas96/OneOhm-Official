CREATE TYPE "public"."contact_channel" AS ENUM('whatsapp', 'sms', 'in_person');--> statement-breakpoint
CREATE TABLE "customer_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"template" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_channel" "contact_channel" DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "whatsapp_unreachable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_handovers" ADD CONSTRAINT "customer_handovers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_handovers" ADD CONSTRAINT "customer_handovers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_handovers" ADD CONSTRAINT "customer_handovers_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_handovers_dedupe_unique" ON "customer_handovers" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "customer_handovers_open_idx" ON "customer_handovers" USING btree ("customer_id","done_at");