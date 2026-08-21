ALTER TABLE "notes" ADD COLUMN "supertag" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "supertag_fields" jsonb;--> statement-breakpoint
CREATE INDEX "notes_owner_supertag_idx" ON "notes" USING btree ("owner_id","supertag") WHERE "notes"."supertag" IS NOT NULL;