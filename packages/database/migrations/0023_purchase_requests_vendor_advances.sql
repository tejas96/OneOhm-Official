CREATE TYPE "public"."purchase_request_status" AS ENUM('pending', 'approved', 'rejected', 'ordered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."vendor_advance_status" AS ENUM('pending', 'approved', 'paid', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'vendor_advance_paid';--> statement-breakpoint
ALTER TYPE "public"."journal_source" ADD VALUE 'vendor_advance_adjusted';--> statement-breakpoint
CREATE TABLE "purchase_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" double precision NOT NULL,
	"needed_by" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"project_id" uuid,
	"reason" text NOT NULL,
	"status" "purchase_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"purchase_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_advance_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advance_id" uuid NOT NULL,
	"payable_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"adjusted_on" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"note" text,
	"status" "vendor_advance_status" DEFAULT 'pending' NOT NULL,
	"recorded_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_on" date,
	"paid_method" "payment_method",
	"paid_reference" text,
	"paid_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"adjusted_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "advance_adjusted_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "rejected_quantity" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advance_adjustments" ADD CONSTRAINT "vendor_advance_adjustments_advance_id_vendor_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."vendor_advances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advance_adjustments" ADD CONSTRAINT "vendor_advance_adjustments_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advance_adjustments" ADD CONSTRAINT "vendor_advance_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_request_lines_request_idx" ON "purchase_request_lines" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_number_unique" ON "purchase_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_requests_project_idx" ON "purchase_requests" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_advance_adjustments_pair_unique" ON "vendor_advance_adjustments" USING btree ("advance_id","payable_id");--> statement-breakpoint
CREATE INDEX "vendor_advance_adjustments_payable_idx" ON "vendor_advance_adjustments" USING btree ("payable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_advances_number_unique" ON "vendor_advances" USING btree ("number");--> statement-breakpoint
CREATE INDEX "vendor_advances_vendor_idx" ON "vendor_advances" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_advances_order_idx" ON "vendor_advances" USING btree ("purchase_order_id");