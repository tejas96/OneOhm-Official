ALTER TABLE "travel_claims" ADD COLUMN "auto_made" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "auto_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "review_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "withdrawn_by_resume_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "route_m" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "straight_m" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "paid_m" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "method" text DEFAULT 'straight' NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "cap_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "gap_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "gap_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "mocked_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_days" ADD COLUMN "points_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "travel_days" SET "straight_m" = "distance_m", "paid_m" = "distance_m";
