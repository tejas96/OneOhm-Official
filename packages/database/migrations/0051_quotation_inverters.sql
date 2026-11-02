CREATE TABLE "quotation_inverters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotation_inverters" ADD CONSTRAINT "quotation_inverters_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_inverters" ADD CONSTRAINT "quotation_inverters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_inverters_position_unique" ON "quotation_inverters" USING btree ("quotation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_inverters_product_unique" ON "quotation_inverters" USING btree ("quotation_id","product_id");--> statement-breakpoint
-- Every saved quotation had one inverter: copy it in as row 0, quantity 1.
INSERT INTO "quotation_inverters" ("quotation_id", "position", "product_id", "quantity")
SELECT "id", 0, "inverter_product_id", 1 FROM "quotations";
