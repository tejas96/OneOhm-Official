CREATE TABLE "lead_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"capacity_wp" integer,
	"module_count" integer,
	"total_paise" bigint,
	"subsidy_paise" bigint,
	"effective_paise" bigint,
	"monthly_saving_paise" bigint,
	"payback_years" double precision,
	"answers" jsonb NOT NULL,
	"priced" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "lead_estimates" ADD CONSTRAINT "lead_estimates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_estimates_lead_idx" ON "lead_estimates" USING btree ("lead_id");