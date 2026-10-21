// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Non-interactive first admin (design §8.1): `node packages/db/dist/create-admin.mjs [--force]`.
// Reads ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (script inputs, not app config) plus
// DATABASE_URL and SITE_URL. Does what /setup does: the admin, the default settings and the two
// menus. Refuses when a user exists unless --force is given; with --force it adds another admin.

import { NewAdminInput } from "@sitebuilder/schema";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as v from "valibot";
import { bootstrapSite } from "./queries/bootstrap";
import { relations } from "./relations";

const Env = v.object({
  DATABASE_URL: v.pipe(
    v.string("DATABASE_URL is not set"),
    v.minLength(1, "DATABASE_URL is not set"),
  ),
  SITE_URL: v.pipe(v.string("SITE_URL is not set"), v.url("SITE_URL must be a URL")),
  ADMIN_NAME: v.string("ADMIN_NAME is not set"),
  ADMIN_EMAIL: v.string("ADMIN_EMAIL is not set"),
  ADMIN_PASSWORD: v.string("ADMIN_PASSWORD is not set"),
});

async function main(): Promise<number> {
  const force = process.argv.includes("--force");

  const env = v.safeParse(Env, process.env);
  if (!env.success) {
    for (const issue of env.issues) console.error(`create-admin: ${issue.message}`);
    return 2;
  }
  const admin = v.safeParse(NewAdminInput, {
    name: env.output.ADMIN_NAME,
    email: env.output.ADMIN_EMAIL,
    password: env.output.ADMIN_PASSWORD,
  });
  if (!admin.success) {
    // Never echo the input: one of them is a password.
    for (const issue of admin.issues) {
      const field = issue.path?.[0]?.key;
      console.error(`create-admin: ADMIN_${String(field).toUpperCase()}: ${issue.message}`);
    }
    return 2;
  }

  const pool = new Pool({ connectionString: env.output.DATABASE_URL, max: 1 });
  try {
    const db = drizzle({ client: pool, relations });
    const result = await bootstrapSite(db, {
      name: admin.output.name,
      email: admin.output.email,
      passwordHash: await hashPassword(admin.output.password),
      siteUrl: env.output.SITE_URL,
      allowExistingUsers: force,
    });
    if (!result.ok) {
      console.error(
        result.error === "already-set-up"
          ? "create-admin: a user already exists; pass --force to add another admin"
          : `create-admin: ${admin.output.email} is already a user`,
      );
      return 1;
    }
    console.log(`create-admin: created admin ${admin.output.email}`);
    return 0;
  } finally {
    await pool.end();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`create-admin: failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
