ALTER TABLE "notes" ADD COLUMN "bucket" text;--> statement-breakpoint
CREATE INDEX "notes_owner_bucket_idx" ON "notes" USING btree ("owner_id","bucket") WHERE "notes"."deleted_at" IS NULL;