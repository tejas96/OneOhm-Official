CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."supply_type" AS ENUM('intra_state', 'inter_state');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'customer_credit';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'customer_refund';--> statement-breakpoint
CREATE TABLE "customer_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"received_on" date NOT NULL,
	"reference" text,
	"gateway_payment_id" text,
	"gateway_fee_paise" bigint,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"value_paise" bigint NOT NULL,
	"discount_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"tax_rate_bp" integer NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"project_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"supply" "supply_type" NOT NULL,
	"supplier_gstin" text NOT NULL,
	"supplier_state_code" text NOT NULL,
	"customer_gstin" text,
	"place_of_supply_code" text NOT NULL,
	"place_of_supply_state" text NOT NULL,
	"value_paise" bigint NOT NULL,
	"discount_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"schedule_total_paise" bigint NOT NULL,
	"parties" jsonb NOT NULL,
	"replaces_invoice_id" uuid,
	"issued_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "customer_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"release_payment_id" uuid,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"reason" text NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hsn_sac" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_from_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_invoice_id_customer_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."customer_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_replaces_invoice_id_customer_invoices_id_fk" FOREIGN KEY ("replaces_invoice_id") REFERENCES "public"."customer_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_release_payment_id_payments_id_fk" FOREIGN KEY ("release_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_credits_project_idx" ON "customer_credits" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_credits_gateway_payment_unique" ON "customer_credits" USING btree ("gateway_payment_id");--> statement-breakpoint
CREATE INDEX "customer_invoice_lines_invoice_idx" ON "customer_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_invoices_number_unique" ON "customer_invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "customer_invoices_project_idx" ON "customer_invoices" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_invoices_one_issued" ON "customer_invoices" USING btree ("project_id") WHERE "customer_invoices"."status" = 'issued';--> statement-breakpoint
CREATE INDEX "customer_refunds_project_idx" ON "customer_refunds" USING btree ("project_id");