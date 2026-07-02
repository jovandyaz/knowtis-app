CREATE TABLE "oauth_payloads" (
	"model" text NOT NULL,
	"id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"grant_id" text,
	"user_code" text,
	"uid" text,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "oauth_payloads_model_id_pk" PRIMARY KEY("model","id")
);
--> statement-breakpoint
CREATE INDEX "idx_oauth_payloads_grant" ON "oauth_payloads" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_payloads_uid" ON "oauth_payloads" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "idx_oauth_payloads_user_code" ON "oauth_payloads" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "idx_oauth_payloads_expires" ON "oauth_payloads" USING btree ("expires_at");