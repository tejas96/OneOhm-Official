CREATE TABLE "holidays" (
	"day" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "start_min" integer;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "end_min" integer;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_or_lead" CHECK ("visits"."customer_id" is not null or "visits"."lead_id" is not null);--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_time_order" CHECK ("visits"."start_min" is null or ("visits"."end_min" > "visits"."start_min" and "visits"."start_min" >= 0 and "visits"."end_min" <= 1440));--> statement-breakpoint
-- Older visits get the times their half of the day maps to (morning 10:00-11:30, afternoon 14:00-15:30).
UPDATE "visits" SET "start_min" = CASE "slot" WHEN 'morning' THEN 600 ELSE 840 END, "end_min" = CASE "slot" WHEN 'morning' THEN 690 ELSE 930 END WHERE "start_min" IS NULL;
