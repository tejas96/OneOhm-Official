ALTER TABLE "person_work_settings" ADD COLUMN "base_latitude" double precision;--> statement-breakpoint
ALTER TABLE "person_work_settings" ADD COLUMN "base_longitude" double precision;--> statement-breakpoint
ALTER TABLE "person_work_settings" ADD COLUMN "base_label" text;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "commute_deduct_m" integer DEFAULT 0 NOT NULL;