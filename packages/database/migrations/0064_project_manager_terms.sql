CREATE TABLE "project_manager_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_manager_terms" ADD CONSTRAINT "project_manager_terms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_manager_terms" ADD CONSTRAINT "project_manager_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_manager_terms_project_idx" ON "project_manager_terms" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_manager_terms_open_unique" ON "project_manager_terms" USING btree ("project_id") WHERE "project_manager_terms"."ended_at" IS NULL;
--> statement-breakpoint
INSERT INTO "project_manager_terms" ("project_id", "user_id", "started_at") SELECT "id", "manager_user_id", "created_at" FROM "projects" WHERE "manager_user_id" IS NOT NULL;
