CREATE TABLE "sign_in_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"method" text NOT NULL,
	"ip" text,
	"user_id" uuid,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_in_attempts" ADD CONSTRAINT "sign_in_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_attempts_identifier_idx" ON "sign_in_attempts" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_ip_idx" ON "sign_in_attempts" USING btree ("ip","created_at");