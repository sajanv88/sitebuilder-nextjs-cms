CREATE TYPE "entry_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "entry_type" AS ENUM('page', 'post');--> statement-breakpoint
CREATE TYPE "taxonomy" AS ENUM('category', 'tag');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" "entry_type" NOT NULL,
	"status" "entry_status" DEFAULT 'draft'::"entry_status" NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"path" text NOT NULL,
	"parent_id" uuid,
	"excerpt" text,
	"content" jsonb NOT NULL,
	"featured_media_id" uuid,
	"author_id" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"source_ref" text,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entry_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" text,
	"storage_key" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"location" text PRIMARY KEY,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"from_path" text PRIMARY KEY,
	"to_path" text NOT NULL,
	"status" integer DEFAULT 301 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_status_check" CHECK ("status" in (301, 302, 307, 308))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_terms" (
	"entry_id" uuid,
	"term_id" uuid,
	CONSTRAINT "entry_terms_pkey" PRIMARY KEY("entry_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"taxonomy" "taxonomy" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"source_ref" text
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_path_key" ON "entries" ("path") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_source_ref_key" ON "entries" ("source_ref");--> statement-breakpoint
CREATE INDEX "entries_list_idx" ON "entries" ("type","status","published_at");--> statement-breakpoint
CREATE INDEX "entries_parent_id_idx" ON "entries" ("parent_id");--> statement-breakpoint
CREATE INDEX "entries_author_id_idx" ON "entries" ("author_id");--> statement-breakpoint
CREATE INDEX "entries_featured_media_id_idx" ON "entries" ("featured_media_id");--> statement-breakpoint
CREATE INDEX "entry_revisions_entry_idx" ON "entry_revisions" ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "entry_revisions_created_by_idx" ON "entry_revisions" ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_key" ON "media" ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_source_ref_key" ON "media" ("source_ref");--> statement-breakpoint
CREATE INDEX "media_uploaded_by_idx" ON "media" ("uploaded_by","created_at");--> statement-breakpoint
CREATE INDEX "entry_terms_term_id_idx" ON "entry_terms" ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_taxonomy_slug_key" ON "terms" ("taxonomy","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_source_ref_key" ON "terms" ("source_ref");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_featured_media_id_media_id_fkey" FOREIGN KEY ("featured_media_id") REFERENCES "media"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "entries"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_entry_id_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_entry_id_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_term_id_terms_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE;