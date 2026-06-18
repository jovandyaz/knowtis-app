CREATE TABLE "user_provider_keys" (
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_provider_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "byok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_provider_keys" ADD CONSTRAINT "user_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;