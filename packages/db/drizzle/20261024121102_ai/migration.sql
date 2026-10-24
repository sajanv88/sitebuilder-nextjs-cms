CREATE TABLE "ai_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"undo" jsonb,
	"discarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" uuid,
	"entry_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_batches_created_by_idx" ON "ai_batches" ("created_by");--> statement-breakpoint
CREATE INDEX "ai_runs_kind_created_at_idx" ON "ai_runs" ("kind","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_user_id_created_at_idx" ON "ai_runs" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_batch_id_idx" ON "ai_runs" ("batch_id");--> statement-breakpoint
CREATE INDEX "ai_runs_entry_id_idx" ON "ai_runs" ("entry_id");--> statement-breakpoint
ALTER TABLE "ai_batches" ADD CONSTRAINT "ai_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_entry_id_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE SET NULL;