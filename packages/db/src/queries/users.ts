// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Role } from "@sitebuilder/schema";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { session, user } from "../schema/auth-schema";
import { entries } from "../schema/entries";
import { entryRevisions } from "../schema/entry-revisions";
import { media } from "../schema/media";

// Better Auth owns most writes to its tables: sign-in, sessions, creating users and passwords.
// The writes here are the ones the last-admin rule (design §6.3) must guard: changing a role,
// banning and deleting. They run in our own transaction, under one advisory lock, so two
// requests can't each remove "the other" admin. Better Auth's endpoints can't join it.

export async function countUsers(db: Executor): Promise<number> {
  const [row] = await db.select({ value: count() }).from(user);
  return row?.value ?? 0;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean;
  createdAt: Date;
  // Entries they're the author of, trash included: deleting them needs a reassign first.
  entryCount: number;
}

export async function listUsers(db: Executor): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      entryCount: count(entries.id),
    })
    .from(user)
    .leftJoin(entries, eq(entries.authorId, user.id))
    .groupBy(user.id)
    .orderBy(asc(sql`lower(${user.name})`), asc(user.id))
    .limit(1000);
  return rows.map((row) => ({ ...row, banned: row.banned ?? false }));
}

// Names for pickers: the post's author, who gets a deleted user's content.
export async function listUserOptions(db: Executor): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(sql`lower(${user.name})`))
    .limit(1000);
}

export async function getUserSummary(
  db: Executor,
  id: string,
): Promise<{ id: string; name: string; role: string | null } | undefined> {
  return db.query.user.findFirst({
    where: { id },
    columns: { id: true, name: true, role: true },
  });
}

// Any number that no other advisory lock in this database uses (bootstrap uses …001).
const ADMINS_LOCK = 724_310_002;

type Guarded = { ok: true } | { ok: false; error: "not-found" | "last-admin" };

// Locks, then refuses when `removesAdmin` would take away the last active admin. Banned admins
// don't count: they can't sign in.
async function guardLastAdmin(
  tx: Executor,
  userId: string,
  removesAdmin: boolean,
): Promise<Guarded> {
  await tx.execute(sql`select pg_advisory_xact_lock(${ADMINS_LOCK})`);
  const target = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { role: true, banned: true },
  });
  if (!target) return { ok: false, error: "not-found" };
  if (!removesAdmin || target.role !== "admin" || target.banned) return { ok: true };

  const [others] = await tx
    .select({ value: count() })
    .from(user)
    .where(
      and(
        eq(user.role, "admin"),
        ne(user.id, userId),
        sql`coalesce(${user.banned}, false) = false`,
      ),
    );
  return (others?.value ?? 0) > 0 ? { ok: true } : { ok: false, error: "last-admin" };
}

// Takes effect on the user's next request: sessions are read from Postgres every time.
export async function setUserRole(db: Executor, userId: string, role: Role): Promise<Guarded> {
  return db.transaction(async (tx) => {
    const guard = await guardLastAdmin(tx, userId, role !== "admin");
    if (!guard.ok) return guard;
    await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId));
    return { ok: true };
  });
}

// Banning also ends every session the user has, so it applies at once.
export async function setUserBanned(
  db: Executor,
  userId: string,
  banned: boolean,
): Promise<Guarded> {
  return db.transaction(async (tx) => {
    const guard = await guardLastAdmin(tx, userId, banned);
    if (!guard.ok) return guard;
    await tx
      .update(user)
      .set({
        banned,
        banReason: banned ? "Banned by an admin" : null,
        banExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
    if (banned) await tx.delete(session).where(eq(session.userId, userId));
    return { ok: true };
  });
}

// Moves a user's entries, revisions and uploads to another user.
export async function reassignContent(db: Executor, fromId: string, toId: string): Promise<void> {
  await db.update(entries).set({ authorId: toId }).where(eq(entries.authorId, fromId));
  await db
    .update(entryRevisions)
    .set({ createdBy: toId })
    .where(eq(entryRevisions.createdBy, fromId));
  await db.update(media).set({ uploadedBy: toId }).where(eq(media.uploadedBy, fromId));
}

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "last-admin" | "has-content" | "invalid-reassign" };

// Deletes a user, with their sessions and accounts (cascade). Their content must go to someone
// first (references to users are `restrict`, decisions #15): pass `reassignTo` when they have any.
export async function deleteUser(
  db: Executor,
  userId: string,
  reassignTo: string | null,
): Promise<DeleteUserResult> {
  return db.transaction(async (tx) => {
    const guard = await guardLastAdmin(tx, userId, true);
    if (!guard.ok) return guard;

    if (reassignTo) {
      const heir = await tx.query.user.findFirst({
        where: { id: reassignTo },
        columns: { id: true },
      });
      if (!heir || reassignTo === userId) return { ok: false, error: "invalid-reassign" };
      await reassignContent(tx, userId, reassignTo);
    } else if (await hasContent(tx, userId)) {
      return { ok: false, error: "has-content" };
    }

    await tx.delete(user).where(eq(user.id, userId));
    return { ok: true };
  });
}

async function hasContent(db: Executor, userId: string): Promise<boolean> {
  const found = await Promise.all([
    db.select({ id: entries.id }).from(entries).where(eq(entries.authorId, userId)).limit(1),
    db
      .select({ id: entryRevisions.id })
      .from(entryRevisions)
      .where(eq(entryRevisions.createdBy, userId))
      .limit(1),
    db.select({ id: media.id }).from(media).where(eq(media.uploadedBy, userId)).limit(1),
  ]);
  return found.some((rows) => rows.length > 0);
}
