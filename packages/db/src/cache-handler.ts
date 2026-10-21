// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { type CacheHandler, createCacheHandler } from "./cache/handler";
import { createTagStore, type TagStore } from "./cache/tag-store";
import { relations } from "./relations";

// The "use cache" handler both zones load (`cacheHandlers.default` in next.config.ts), bundled
// to dist/cache-handler.mjs like the migrator: Next imports it by path at runtime, outside the
// app's own bundle (decisions #63). Its pool is its own and small: one short query at a time.

// `next build` has no database, and a build's cache doesn't outlive it, so it keeps tags in
// memory only, as Next's default handler does.
const noStore: TagStore = {
  write: async () => [],
  latest: async () => 0,
  changesSince: async () => [],
};

function tagStore(): TagStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || process.env.NEXT_PHASE === "phase-production-build") return noStore;
  const pool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    // A slow database delays a page by this much at most; the page then renders from memory.
    statement_timeout: 2_000,
  });
  // An idle connection dropped by the server mustn't take the process down.
  pool.on("error", (error) => console.error("[cache] idle connection failed", error));
  return createTagStore(drizzle({ client: pool, relations }));
}

const handler: CacheHandler = createCacheHandler(tagStore());
export default handler;
