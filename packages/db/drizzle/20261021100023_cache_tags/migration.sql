CREATE TABLE "cache_tags" (
	"tag" text PRIMARY KEY,
	"expire_seconds" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cache_tags_updated_at_idx" ON "cache_tags" ("updated_at");