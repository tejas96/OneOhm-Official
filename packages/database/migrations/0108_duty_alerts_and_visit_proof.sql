CREATE TABLE "duty_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"person_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"day" date NOT NULL,
	"title" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"seen_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_reason" text
);
--> statement-breakpoint
DROP INDEX "duty_points_day_idx";--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "proof" text;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "proof_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "proof_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duty_alerts" ADD CONSTRAINT "duty_alerts_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_alerts" ADD CONSTRAINT "duty_alerts_seen_by_users_id_fk" FOREIGN KEY ("seen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_alerts" ADD CONSTRAINT "duty_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duty_alerts_once" ON "duty_alerts" USING btree ("kind","subject_type","subject_id","day");--> statement-breakpoint
CREATE INDEX "duty_alerts_open_idx" ON "duty_alerts" USING btree ("person_id","created_at") WHERE "duty_alerts"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "duty_alerts_day_idx" ON "duty_alerts" USING btree ("day");--> statement-breakpoint
CREATE INDEX "duty_points_day_recorded_idx" ON "duty_points" USING btree ("attendance_day_id","recorded_at");