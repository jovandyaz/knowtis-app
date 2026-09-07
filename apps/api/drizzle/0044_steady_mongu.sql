CREATE TABLE "flashcard_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"card_index" integer NOT NULL,
	"quality" smallint NOT NULL,
	"interval_before_days" integer NOT NULL,
	"interval_after_days" integer NOT NULL,
	"ease_after" numeric(4, 2) NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_reviews_quality_check" CHECK ("flashcard_reviews"."quality" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flashcard_reviews_user_reviewed_idx" ON "flashcard_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_scope_check" CHECK ("quiz_attempts"."scope" in ('full', 'missed'));