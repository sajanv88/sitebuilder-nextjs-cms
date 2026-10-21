// Local development data: `pnpm db:seed`. Idempotent, so it's safe to run again: rows that
// already exist are left alone. Never run it against production. Users come from /setup or
// create-admin, not from here.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ensureMenus } from "./queries/menus";
import { relations } from "./relations";
import { terms } from "./schema";

const seedTerms = [
  { taxonomy: "category", name: "News", slug: "news" },
  { taxonomy: "category", name: "Guides", slug: "guides" },
  { taxonomy: "tag", name: "Release", slug: "release" },
] as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("seed: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  const db = drizzle({ client: pool, relations });
  await ensureMenus(db);
  const inserted = await db
    .insert(terms)
    .values([...seedTerms])
    .onConflictDoNothing({ target: [terms.taxonomy, terms.slug] })
    .returning({ slug: terms.slug });
  console.log(`seed: menus ensured, inserted ${inserted.length} of ${seedTerms.length} terms`);
} catch (error) {
  console.error(`seed: failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
