CREATE TABLE "travel_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"distance_m" integer NOT NULL,
	"rate_paise_per_km" integer NOT NULL,
	"legs" jsonb NOT NULL,
	"visits" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "closed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "close_kind" text;--> statement-breakpoint
ALTER TABLE "site_visits" ADD COLUMN "close_note" text;--> statement-breakpoint
ALTER TABLE "travel_days" ADD CONSTRAINT "travel_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_days_user_date_unique" ON "travel_days" USING btree ("user_id","work_date");--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_visits_visit_idx" ON "site_visits" USING btree ("visit_id");