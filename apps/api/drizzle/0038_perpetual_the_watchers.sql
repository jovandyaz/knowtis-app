ALTER TYPE "public"."conversation_role" ADD VALUE 'tool';--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "stop_reason" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "turn_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_stop_reason_check" CHECK ("conversation_messages"."stop_reason" IS NULL OR "conversation_messages"."stop_reason" IN ('completed', 'max_steps', 'length', 'token_budget', 'content_filter', 'error', 'aborted'));