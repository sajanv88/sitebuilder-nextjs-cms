ALTER TABLE "entries" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', title), 'A') ||
  setweight(to_tsvector('simple', coalesce(excerpt, '') || ' ' || coalesce(seo_description, '')), 'B') ||
  setweight(jsonb_to_tsvector('simple', jsonb_path_query_array(content, 'lax $.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "^(text|html|headline|body|heading|eyebrow|title|description|caption|cite|quote|author|role|name|question|answer|label|features|columns|rows|price|prefix|suffix)$").value'), '["string"]'), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "entries_search_idx" ON "entries" USING gin ("search");