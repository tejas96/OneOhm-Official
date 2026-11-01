ALTER TYPE "public"."journal_source" ADD VALUE 'tds_deposit';--> statement-breakpoint
CREATE TABLE "leave_manager_reviews" (
	"leave_request_id" uuid PRIMARY KEY NOT NULL,
	"manager_user_id" uuid NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_lines" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"manager_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_lines_not_self" CHECK ("reporting_lines"."user_id" <> "reporting_lines"."manager_user_id")
);
--> statement-breakpoint
CREATE TABLE "tax_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"contractor_tds_bp" integer DEFAULT 100 NOT NULL,
	"vendor_service_tds_bp" integer DEFAULT 200 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tds_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"section" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"challan_number" text NOT NULL,
	"deposited_on" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contractors" ALTER COLUMN "tds_bp" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contractors" ALTER COLUMN "tds_bp" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "tds_bp" integer;--> statement-breakpoint
ALTER TABLE "leave_manager_reviews" ADD CONSTRAINT "leave_manager_reviews_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_manager_reviews" ADD CONSTRAINT "leave_manager_reviews_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_deposits" ADD CONSTRAINT "tds_deposits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_manager_reviews_manager_idx" ON "leave_manager_reviews" USING btree ("manager_user_id","state");--> statement-breakpoint
CREATE INDEX "reporting_lines_manager_idx" ON "reporting_lines" USING btree ("manager_user_id");--> statement-breakpoint
CREATE INDEX "tds_deposits_month_idx" ON "tds_deposits" USING btree ("month","section");--> statement-breakpoint
UPDATE "ledger_accounts" SET "name" = 'Employee payables (claims and bonuses)' WHERE "code" = '2030';
