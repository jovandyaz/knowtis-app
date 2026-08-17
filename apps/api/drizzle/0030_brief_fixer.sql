ALTER TABLE "ai_catalog_models" DROP CONSTRAINT "ai_catalog_models_status_check";--> statement-breakpoint
UPDATE "ai_catalog_models"
SET "status" = 'candidate', "tier" = 'open', "promoted_by" = NULL, "promoted_at" = NULL, "updated_at" = now()
WHERE "status" = 'retired';--> statement-breakpoint
ALTER TABLE "ai_catalog_models" ADD CONSTRAINT "ai_catalog_models_status_check" CHECK ("ai_catalog_models"."status" in ('candidate', 'promoted'));
