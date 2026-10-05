CREATE TABLE "ai_model_resolutions" (
	"selector_key" varchar(32) PRIMARY KEY NOT NULL,
	"active_model_id" varchar(120) NOT NULL,
	"previous_model_id" varchar(120),
	"changed_at" timestamp with time zone,
	"released_model_id" varchar(120),
	"released_at" timestamp with time zone,
	"pending_model_id" varchar(120),
	"gate_status" varchar(16),
	"gate_detail" varchar(500),
	"gate_run_url" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_resolutions_selector_key_check" CHECK ("ai_model_resolutions"."selector_key" in ('platform.fast', 'platform.balanced', 'platform.powerful')),
	CONSTRAINT "ai_model_resolutions_gate_status_check" CHECK ("ai_model_resolutions"."gate_status" in ('pending', 'passed', 'failed')),
	CONSTRAINT "ai_model_resolutions_pending_gate_check" CHECK (("ai_model_resolutions"."pending_model_id" is null) = ("ai_model_resolutions"."gate_status" is null))
);
