ALTER TYPE "public"."structure_type" ADD VALUE 'aluminium_rail';--> statement-breakpoint
ALTER TYPE "public"."structure_type" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "company_profile" ADD COLUMN "base_latitude" double precision;--> statement-breakpoint
ALTER TABLE "company_profile" ADD COLUMN "base_longitude" double precision;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "costing" jsonb;