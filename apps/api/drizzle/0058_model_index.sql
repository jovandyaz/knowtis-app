CREATE TABLE "ai_model_index" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"provider" varchar(16) NOT NULL,
	"name" varchar(100) NOT NULL,
	"family" varchar(64),
	"released_at" date,
	"status" varchar(16) NOT NULL,
	"tool_call" boolean,
	"structured_output" boolean,
	"input_modalities" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_modalities" text[] DEFAULT '{}'::text[] NOT NULL,
	"input_cost_per_token" numeric(20, 15),
	"output_cost_per_token" numeric(20, 15),
	"cache_read_cost_per_token" numeric(20, 15),
	"cache_write_cost_per_token" numeric(20, 15),
	"max_input_tokens" integer,
	"max_output_tokens" integer,
	"reasoning" jsonb,
	"canonical" varchar(120) NOT NULL,
	"open_weights" boolean,
	"retires_at" date,
	"source" varchar(16) NOT NULL,
	"absent_since" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_index_provider_check" CHECK ("ai_model_index"."provider" in ('anthropic', 'openai', 'google', 'openrouter')),
	CONSTRAINT "ai_model_index_status_check" CHECK ("ai_model_index"."status" in ('active', 'beta', 'alpha', 'deprecated')),
	CONSTRAINT "ai_model_index_source_check" CHECK ("ai_model_index"."source" in ('models_dev', 'openrouter'))
);
--> statement-breakpoint
CREATE INDEX "ai_model_index_provider_idx" ON "ai_model_index" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "ai_model_index_listed_idx" ON "ai_model_index" USING btree ("absent_since") WHERE absent_since is null;