CREATE TABLE "monthly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"decision" text NOT NULL,
	"bonus_id" uuid,
	"note" text,
	"decided_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_bonus_id_project_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."project_bonuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reviews_user_month_unique" ON "monthly_reviews" USING btree ("user_id","month");--> statement-breakpoint
INSERT INTO "points_rules" ("key") VALUES ('fair_points') ON CONFLICT DO NOTHING;
