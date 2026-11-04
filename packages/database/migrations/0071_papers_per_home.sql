CREATE INDEX "documents_property_idx" ON "documents" USING btree ("property_id");
--> statement-breakpoint
-- Papers belong to a home: every project paper takes its project's property. Papers already on a property are kept.
UPDATE "documents" AS "d" SET "property_id" = "p"."property_id" FROM "projects" AS "p" WHERE "d"."project_id" = "p"."id" AND "d"."property_id" IS NULL;--> statement-breakpoint
-- New customer template, off until Meta approves it; a row already there is kept.
INSERT INTO "message_templates" ("key", "audience", "meta_name", "fields", "preview", "active") VALUES ('paper_request', 'customer', 'paper_request', ARRAY['customer','document','home'], 'Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.', false) ON CONFLICT ("key") DO NOTHING;
