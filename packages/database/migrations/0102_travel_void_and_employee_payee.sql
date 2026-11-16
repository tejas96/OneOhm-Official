ALTER TYPE "public"."payable_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "employee_bank_details" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bank_account_name" text,
	"bank_account_number" text,
	"bank_ifsc" text,
	"bank_changed_at" timestamp with time zone,
	"bank_changed_by_user_id" uuid,
	"bank_hold_until" timestamp with time zone,
	"bank_hold_released_by_user_id" uuid,
	"bank_hold_released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "voided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_bank_changed_by_user_id_users_id_fk" FOREIGN KEY ("bank_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_bank_hold_released_by_user_id_users_id_fk" FOREIGN KEY ("bank_hold_released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;