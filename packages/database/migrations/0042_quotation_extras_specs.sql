ALTER TABLE "products" ADD COLUMN "efficiency_bp" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "technology" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "warranty_years" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "datasheet_document_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "extra_kind" text;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;