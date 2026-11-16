CREATE TABLE "month_sheet_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"breakdown" jsonb NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_by" uuid,
	"told_change" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"status" text NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp with time zone,
	"unlocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_sheets_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "employment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"day" date NOT NULL,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"monthly_pay_paise" bigint,
	"effective_from" date NOT NULL,
	"set_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_work_settings" ADD COLUMN "monthly_pay_paise" bigint;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_month" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "paid" boolean;--> statement-breakpoint
ALTER TABLE "month_sheet_rows" ADD CONSTRAINT "month_sheet_rows_sheet_id_month_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."month_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_sheet_rows" ADD CONSTRAINT "month_sheet_rows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_sheet_rows" ADD CONSTRAINT "month_sheet_rows_refreshed_by_users_id_fk" FOREIGN KEY ("refreshed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_sheets" ADD CONSTRAINT "month_sheets_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_history" ADD CONSTRAINT "pay_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_history" ADD CONSTRAINT "pay_history_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "month_sheet_rows_sheet_user_unique" ON "month_sheet_rows" USING btree ("sheet_id","user_id");--> statement-breakpoint
CREATE INDEX "month_sheet_rows_user_idx" ON "month_sheet_rows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employment_events_user_idx" ON "employment_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "pay_history_user_idx" ON "pay_history" USING btree ("user_id","effective_from");