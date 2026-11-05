ALTER TABLE "documents" ADD COLUMN "sorted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD COLUMN "files_ask_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD COLUMN "files_ask_tries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "wa_conversations_files_ask_idx" ON "wa_conversations" USING btree ("files_ask_at") WHERE "wa_conversations"."files_ask_at" is not null;--> statement-breakpoint
UPDATE "wa_conversations" SET "files_ask_at" = to_timestamp(("context"->'filesWait'->>'askAt')::bigint / 1000.0) WHERE "context"->'filesWait'->>'askAt' IS NOT NULL;
