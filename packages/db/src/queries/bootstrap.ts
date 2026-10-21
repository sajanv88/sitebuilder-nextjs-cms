// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";
import { defaultSettings } from "@sitebuilder/schema";
import { sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { account, user } from "../schema/auth-schema";
import { ensureMenus } from "./menus";
import { insertDefaultSettings } from "./settings";
import { countUsers } from "./users";

export interface BootstrapInput {
  name: string;
  // Lowercased already (Email in @sitebuilder/schema), as Better Auth stores it.
  email: string;
  // From Better Auth's hashPassword, so its sign-in can verify it.
  passwordHash: string;
  siteUrl: string;
  // false: refuse when any user exists (/setup, create-admin). true: create-admin --force.
  allowExistingUsers: boolean;
}

export type BootstrapResult =
  | { ok: true; userId: string }
  | { ok: false; error: "already-set-up" | "email-taken" };

// Any number that no other advisory lock in this database uses.
const BOOTSTRAP_LOCK = 724_310_001;

// Creates an admin with an email-and-password account, the default settings rows and the two
// empty menus (design §8.1), in one transaction. A transaction-scoped advisory lock serialises
// concurrent calls, so two /setup requests at once can't both see an empty user table.
export async function bootstrapSite(db: Executor, input: BootstrapInput): Promise<BootstrapResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);

    if (!input.allowExistingUsers && (await countUsers(tx)) > 0) {
      return { ok: false, error: "already-set-up" };
    }

    const userId = randomUUID();
    const [created] = await tx
      .insert(user)
      .values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: true,
        role: "admin",
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });
    if (!created) return { ok: false, error: "email-taken" };

    // Better Auth's email-and-password account: provider "credential", account id = user id.
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: input.passwordHash,
      updatedAt: new Date(),
    });

    await insertDefaultSettings(tx, defaultSettings(input.siteUrl));
    await ensureMenus(tx);
    return { ok: true, userId };
  });
}
