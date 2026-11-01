CREATE TABLE "lead_steps" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stage" "lead_stage" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "step_key" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_step_key_lead_steps_key_fk" FOREIGN KEY ("step_key") REFERENCES "public"."lead_steps"("key") ON DELETE set null ON UPDATE no action;