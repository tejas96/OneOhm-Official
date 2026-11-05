CREATE TABLE "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payable_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contractors" ADD COLUMN "bank_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contractors" ADD COLUMN "bank_changed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "contractors" ADD COLUMN "bank_hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contractors" ADD COLUMN "bank_hold_released_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "contractors" ADD COLUMN "bank_hold_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_changed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_hold_released_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bank_hold_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "payout_request_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD COLUMN "asked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_requests_payable_idx" ON "payout_requests" USING btree ("payable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_one_open" ON "payout_requests" USING btree ("payable_id") WHERE "payout_requests"."status" = 'open';--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_bank_changed_by_user_id_users_id_fk" FOREIGN KEY ("bank_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_bank_hold_released_by_user_id_users_id_fk" FOREIGN KEY ("bank_hold_released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_bank_changed_by_user_id_users_id_fk" FOREIGN KEY ("bank_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_bank_hold_released_by_user_id_users_id_fk" FOREIGN KEY ("bank_hold_released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_payout_request_id_payout_requests_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payouts" ADD CONSTRAINT "bank_payouts_asked_by_user_id_users_id_fk" FOREIGN KEY ("asked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;