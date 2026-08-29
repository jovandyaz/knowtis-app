ALTER TABLE "email_verification_tokens" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD COLUMN "code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE users SET email_verified_at = now() WHERE role = 'admin' AND email_verified_at IS NULL;