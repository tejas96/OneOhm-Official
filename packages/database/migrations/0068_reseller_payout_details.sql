CREATE TABLE "reseller_payout_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bank_account_name" text,
	"bank_account_number" text,
	"bank_ifsc" text,
	"upi_id" text,
	"pan" text,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reseller_payout_details" ADD CONSTRAINT "reseller_payout_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_payout_details" ADD CONSTRAINT "reseller_payout_details_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;