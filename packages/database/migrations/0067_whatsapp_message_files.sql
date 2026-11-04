ALTER TABLE "wa_messages" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_messages_media_idx" ON "wa_messages" USING btree ("media_id");