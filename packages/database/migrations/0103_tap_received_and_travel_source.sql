ALTER TABLE "travel_days" ADD COLUMN "source" text DEFAULT 'close' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD COLUMN "check_in_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD COLUMN "check_out_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD COLUMN "tap_delayed" boolean DEFAULT false NOT NULL;