CREATE TABLE "ai_config" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" varchar(500) NOT NULL,
	"description" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
