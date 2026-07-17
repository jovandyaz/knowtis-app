CREATE TABLE "system_provider_keys" (
	"provider" varchar(20) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"ciphertext" text,
	"iv" text,
	"auth_tag" text,
	"key_prefix" varchar(12),
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_provider_keys_provider_check" CHECK ("system_provider_keys"."provider" in ('anthropic', 'openai', 'google', 'openrouter')),
	CONSTRAINT "system_provider_keys_secret_complete" CHECK (("system_provider_keys"."ciphertext" is null and "system_provider_keys"."iv" is null and "system_provider_keys"."auth_tag" is null and "system_provider_keys"."key_prefix" is null)
          or ("system_provider_keys"."ciphertext" is not null and "system_provider_keys"."iv" is not null and "system_provider_keys"."auth_tag" is not null and "system_provider_keys"."key_prefix" is not null))
);
--> statement-breakpoint
ALTER TABLE "system_provider_keys" ADD CONSTRAINT "system_provider_keys_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;