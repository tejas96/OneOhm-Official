CREATE TYPE "public"."cover_answer" AS ENUM('asked', 'accepted', 'declined');--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "cover_answer" "cover_answer";--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "cover_note" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "cover_answered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "leave_requests" SET "cover_answer" = 'asked' WHERE "backup_user_id" IS NOT NULL AND "status" = 'pending';--> statement-breakpoint
UPDATE "leave_requests" SET "cover_answer" = 'accepted' WHERE "backup_user_id" IS NOT NULL AND "status" <> 'pending';
