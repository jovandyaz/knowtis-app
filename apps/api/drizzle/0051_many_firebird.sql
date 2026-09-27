DROP INDEX "sessions_refresh_token_hash_idx";--> statement-breakpoint
DELETE FROM "sessions" AS "duplicate" USING "sessions" AS "kept"
WHERE "duplicate"."refresh_token_hash" = "kept"."refresh_token_hash"
  AND ("duplicate"."created_at", "duplicate"."id") > ("kept"."created_at", "kept"."id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");