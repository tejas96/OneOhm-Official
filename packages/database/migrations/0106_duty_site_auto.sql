ALTER TABLE "site_visits" ADD COLUMN "check_in_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "check_out_source" text;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "delayed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "leave_reason" text;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "leave_reason_at" timestamp with time zone;--> statement-breakpoint
UPDATE "site_visits" SET "check_out_source" = CASE "close_kind"
  WHEN 'manager' THEN 'force_close'
  WHEN 'day_end' THEN 'day_end'
  ELSE 'manual' END
WHERE "check_out_at" IS NOT NULL;
