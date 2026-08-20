-- The unique index cannot be built while the racy upsert's duplicate rows survive; newest wins.
DELETE FROM "note_permissions" a
USING "note_permissions" b
WHERE a."note_id" = b."note_id"
  AND a."user_id" = b."user_id"
  AND (
    a."created_at" < b."created_at"
    OR (a."created_at" = b."created_at" AND a.ctid < b.ctid)
  );--> statement-breakpoint
DROP INDEX "permissions_note_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_note_user_idx" ON "note_permissions" USING btree ("note_id","user_id");
