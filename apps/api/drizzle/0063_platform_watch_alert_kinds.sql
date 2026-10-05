ALTER TABLE "ai_catalog_alerts" DROP CONSTRAINT "ai_catalog_alerts_kind_check";--> statement-breakpoint
DELETE FROM "ai_catalog_alerts" WHERE "kind" = 'price_drift';--> statement-breakpoint
UPDATE "ai_catalog_alerts" SET "kind" = 'retirement_scheduled' WHERE "kind" = 'deprecation';--> statement-breakpoint
ALTER TABLE "ai_catalog_alerts" ADD CONSTRAINT "ai_catalog_alerts_kind_check" CHECK ("ai_catalog_alerts"."kind" in ('unavailable', 'pin_unavailable', 'retirement_scheduled', 'selector_empty', 'resolution_pending', 'gate_failed', 'sync_rejected', 'family_drift', 'sync_stale'));