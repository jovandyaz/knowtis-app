ALTER TABLE "conversation_messages" ADD COLUMN "used_memory_ids" uuid[];--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_checked_seq" bigint;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_tainted_seq" bigint;--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD COLUMN "memory_resumed_at" timestamp with time zone;