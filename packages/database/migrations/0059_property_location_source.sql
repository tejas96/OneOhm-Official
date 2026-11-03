CREATE TYPE "public"."location_source" AS ENUM('gps', 'map_pin', 'address', 'typed');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "location_source" "location_source";--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "location_accuracy_m" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "located_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "located_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "location_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "location_flag_distance_m" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "previous_latitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "previous_longitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_located_by_user_id_users_id_fk" FOREIGN KEY ("located_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "properties" SET "location_source" = 'gps' WHERE "latitude" IS NOT NULL;
