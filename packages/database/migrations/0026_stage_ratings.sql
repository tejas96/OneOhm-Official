CREATE TABLE "stage_rating_people" (
	"rating_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	CONSTRAINT "stage_rating_people_rating_id_user_id_pk" PRIMARY KEY("rating_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stage_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"reply" text,
	"replied_by_user_id" uuid,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stage_rating_people" ADD CONSTRAINT "stage_rating_people_rating_id_stage_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."stage_ratings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rating_people" ADD CONSTRAINT "stage_rating_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_replied_by_user_id_users_id_fk" FOREIGN KEY ("replied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_rating_people_user_idx" ON "stage_rating_people" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_ratings_project_stage_unique" ON "stage_ratings" USING btree ("project_id","stage");--> statement-breakpoint
CREATE INDEX "stage_ratings_customer_idx" ON "stage_ratings" USING btree ("customer_id");