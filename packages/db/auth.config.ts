// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Generation-only Better Auth config: `pnpm db:auth-schema` reads it to write
// src/schema/auth-schema.ts. It mirrors what in apps/admin/src/auth/auth.ts adds tables or
// columns: the plugins and the database rate-limit storage (roles and other options don't).
// Changing either there means changing it here and regenerating. Never imported at runtime.

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  // The CLI reads the adapter's type and provider; it never connects.
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: true, storage: "database" },
  plugins: [admin()],
});
