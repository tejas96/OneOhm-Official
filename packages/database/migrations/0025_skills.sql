CREATE TABLE "skills" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" uuid NOT NULL,
	"skill_key" text NOT NULL,
	CONSTRAINT "user_skills_user_id_skill_key_pk" PRIMARY KEY("user_id","skill_key")
);
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "skill_key" text;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_key_skills_key_fk" FOREIGN KEY ("skill_key") REFERENCES "public"."skills"("key") ON DELETE cascade ON UPDATE no action;