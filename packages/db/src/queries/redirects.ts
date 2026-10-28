// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  isPrefixRedirect,
  type RedirectInput,
  redirectBase,
  redirectTarget,
} from "@sitebuilder/schema";
import { and, asc, eq, isNull, like } from "drizzle-orm";
import type { Executor } from "../executor";
import { entries } from "../schema/entries";
import { redirects } from "../schema/site";

// The Redirects screen (decisions #145): every redirect, the ones a moved page wrote and the
// ones written by hand, which an admin or editor can add, change and remove.

export interface RedirectRow {
  fromPath: string;
  toPath: string;
  status: number;
  createdAt: Date;
}

export async function listRedirects(db: Executor): Promise<RedirectRow[]> {
  return db
    .select({
      fromPath: redirects.fromPath,
      toPath: redirects.toPath,
      status: redirects.status,
      createdAt: redirects.createdAt,
    })
    .from(redirects)
    .orderBy(asc(redirects.fromPath))
    .limit(5000);
}

export type SaveRedirectResult =
  | { ok: true }
  // A page or post is at that address: it would win, so the redirect would never apply.
  | { ok: false; error: "entry-there" }
  // Another redirect already starts there.
  | { ok: false; error: "taken" }
  // The one being changed is gone.
  | { ok: false; error: "not-found" }
  // Its target redirects straight back to it.
  | { ok: false; error: "loop" };

export async function saveRedirect(
  db: Executor,
  input: RedirectInput,
): Promise<SaveRedirectResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.path, input.from), isNull(entries.deletedAt)))
      .limit(1);
    if (entry) return { ok: false, error: "entry-there" };

    if (input.original) {
      const [current] = await tx
        .select({ fromPath: redirects.fromPath })
        .from(redirects)
        .where(eq(redirects.fromPath, input.original))
        .for("update");
      if (!current) return { ok: false, error: "not-found" };
    }
    if (input.from !== input.original) {
      const [other] = await tx
        .select({ fromPath: redirects.fromPath })
        .from(redirects)
        .where(eq(redirects.fromPath, input.from));
      if (other) return { ok: false, error: "taken" };
    }

    // Two that send each other back and forth (/a → /b, /b → /a).
    if (input.to.startsWith("/")) {
      const target = input.to.endsWith("/*") ? redirectBase(input.to) : input.to;
      const onward = await redirectFor(tx, target, input.original);
      if (onward && redirectTarget(input.from, input.to, onward) !== null) {
        return { ok: false, error: "loop" };
      }
    }

    if (input.original && input.original !== input.from) {
      await tx.delete(redirects).where(eq(redirects.fromPath, input.original));
    }
    await tx
      .insert(redirects)
      .values({ fromPath: input.from, toPath: input.to, status: input.status })
      .onConflictDoUpdate({
        target: redirects.fromPath,
        set: { toPath: input.to, status: input.status },
      });
    return { ok: true };
  });
}

export async function deleteRedirect(db: Executor, fromPath: string): Promise<boolean> {
  const removed = await db
    .delete(redirects)
    .where(eq(redirects.fromPath, fromPath))
    .returning({ fromPath: redirects.fromPath });
  return removed.length > 0;
}

// Where a path is sent by a redirect: its own redirect first, else the "/*" one that covers it
// most closely (/blog/2024/* before /blog/*). `except` leaves one redirect out, the one being
// changed. Null when none applies.
export async function redirectFor(db: Executor, path: string, except = ""): Promise<string | null> {
  const [exact] = await db
    .select({ to: redirects.toPath })
    .from(redirects)
    .where(eq(redirects.fromPath, path))
    .limit(1);
  if (exact && path !== except) return exact.to;
  const prefixes = await db
    .select({ from: redirects.fromPath, to: redirects.toPath })
    .from(redirects)
    .where(like(redirects.fromPath, "%/*"));
  const covering = prefixes
    .filter((row) => row.from !== except && isPrefixRedirect(row.from))
    .map((row) => ({ ...row, target: redirectTarget(row.from, row.to, path) }))
    .filter((row) => row.target !== null)
    .sort((a, b) => b.from.length - a.from.length);
  return covering[0]?.target ?? null;
}

// The status a "/*" redirect answers with, for resolveRoute.
export async function prefixRedirect(
  db: Executor,
  path: string,
): Promise<{ to: string; status: number } | null> {
  const prefixes = await db
    .select({ from: redirects.fromPath, to: redirects.toPath, status: redirects.status })
    .from(redirects)
    .where(like(redirects.fromPath, "%/*"));
  const best = prefixes
    .map((row) => ({ ...row, target: redirectTarget(row.from, row.to, path) }))
    .filter((row): row is typeof row & { target: string } => row.target !== null)
    .sort((a, b) => b.from.length - a.from.length)[0];
  return best ? { to: best.target, status: best.status } : null;
}
