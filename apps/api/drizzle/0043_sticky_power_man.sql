DROP INDEX "email_verification_tokens_user_id_idx";--> statement-breakpoint
DELETE FROM "email_verification_tokens" a USING "email_verification_tokens" b
WHERE a."user_id" = b."user_id" AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");