CREATE TYPE "public"."material_slip_kind" AS ENUM('issue', 'use', 'return');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_kind" ADD VALUE 'issue';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_kind" ADD VALUE 'return';--> statement-breakpoint
ALTER TYPE "public"."reservation_status" ADD VALUE 'issued';--> statement-breakpoint
CREATE TABLE "material_slip_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slip_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_key" text,
	"quantity" double precision NOT NULL,
	"serials" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" "material_slip_kind" NOT NULL,
	"contractor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"location_id" uuid,
	"dispatch_id" uuid,
	"task_id" uuid,
	"occurred_on" date NOT NULL,
	"note" text,
	"photo_document_id" uuid,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "contractor_id" uuid;--> statement-breakpoint
ALTER TABLE "material_slip_lines" ADD CONSTRAINT "material_slip_lines_slip_id_material_slips_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."material_slips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slip_lines" ADD CONSTRAINT "material_slip_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_photo_document_id_documents_id_fk" FOREIGN KEY ("photo_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_slips" ADD CONSTRAINT "material_slips_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_slip_lines_slip_idx" ON "material_slip_lines" USING btree ("slip_id");--> statement-breakpoint
CREATE INDEX "material_slip_lines_product_idx" ON "material_slip_lines" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_slips_number_unique" ON "material_slips" USING btree ("number");--> statement-breakpoint
CREATE INDEX "material_slips_contractor_idx" ON "material_slips" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "material_slips_project_idx" ON "material_slips" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;