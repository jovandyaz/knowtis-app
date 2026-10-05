CREATE TABLE "user_provider_models" (
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"key_fingerprint" varchar(64) NOT NULL,
	"model_ids" text[] NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "user_provider_models_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "user_provider_models" ADD CONSTRAINT "user_provider_models_key_fk" FOREIGN KEY ("user_id","provider") REFERENCES "public"."user_provider_keys"("user_id","provider") ON DELETE cascade ON UPDATE no action;