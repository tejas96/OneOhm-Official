ALTER TABLE "leads" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "floors" integer;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "not_before" timestamp with time zone;