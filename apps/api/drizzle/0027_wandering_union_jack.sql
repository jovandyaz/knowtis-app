CREATE TABLE "ai_catalog_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" varchar(120) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"detail" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "ai_catalog_alerts_kind_check" CHECK ("ai_catalog_alerts"."kind" in ('deprecation', 'price_drift'))
);
--> statement-breakpoint
CREATE TABLE "ai_catalog_models" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"tier" varchar(16) DEFAULT 'open' NOT NULL,
	"status" varchar(16) DEFAULT 'candidate' NOT NULL,
	"input_cost_per_token" numeric(12, 10) NOT NULL,
	"output_cost_per_token" numeric(12, 10) NOT NULL,
	"max_input_tokens" integer NOT NULL,
	"max_output_tokens" integer,
	"intelligence_index" numeric(4, 1),
	"upstream_created_at" timestamp with time zone,
	"upstream_expiration_date" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_by" uuid,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_catalog_models_status_check" CHECK ("ai_catalog_models"."status" in ('candidate', 'promoted', 'retired')),
	CONSTRAINT "ai_catalog_models_tier_check" CHECK ("ai_catalog_models"."tier" in ('fast', 'balanced', 'powerful', 'open'))
);
--> statement-breakpoint
ALTER TABLE "ai_catalog_alerts" ADD CONSTRAINT "ai_catalog_alerts_model_id_ai_catalog_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_catalog_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_catalog_models" ADD CONSTRAINT "ai_catalog_models_promoted_by_users_id_fk" FOREIGN KEY ("promoted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_catalog_alerts_resolved_idx" ON "ai_catalog_alerts" USING btree ("resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_catalog_alerts_open_uniq" ON "ai_catalog_alerts" USING btree ("model_id","kind") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "ai_catalog_models_status_idx" ON "ai_catalog_models" USING btree ("status");