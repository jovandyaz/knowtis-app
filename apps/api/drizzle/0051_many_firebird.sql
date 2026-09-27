DROP INDEX "sessions_refresh_token_hash_idx";--> statement-breakpoint
DELETE FROM "sessions" WHERE "refresh_token_hash" IN (
  SELECT "refresh_token_hash" FROM "sessions" GROUP BY "refresh_token_hash" HAVING count(*) > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");