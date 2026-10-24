// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Menu } from "@sitebuilder/schema";
import { and, count, countDistinct, eq, gte, isNull, like, lt, sql, sum } from "drizzle-orm";
import type { Executor } from "../executor";
import { type AiBatch, type AiBatchUndo, aiBatches, aiRuns, type NewAiRun } from "../schema/ai";
import { entries } from "../schema/entries";
import { getMenu, saveMenu } from "./menus";
import { getReading } from "./public";
import { getSettings, upsertSettings } from "./settings";

// The AI assistant's records (templates_and_ai_design B9, B10): its calls, for the limits, and
// its batches, for finishing and discarding a designed site. No business rules: who may do what
// is the admin's route handlers' call.

export async function recordAiRun(db: Executor, run: NewAiRun): Promise<void> {
  await db.insert(aiRuns).values(run);
}

// The start of the current day in UTC, when the daily limits start over.
export const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export interface AiUsage {
  // Sites this user has had planned today.
  batchesToday: number;
  // Tokens the whole site has used today, sent and received.
  tokensToday: number;
  // This user's single-page help in the last hour (kinds other than the design flow's).
  helpLastHour: number;
}

export async function aiUsage(db: Executor, userId: string, now = new Date()): Promise<AiUsage> {
  const day = startOfUtcDay(now);
  const hour = new Date(now.getTime() - 60 * 60_000);
  const [batches] = await db
    .select({ n: countDistinct(aiRuns.batchId) })
    .from(aiRuns)
    .where(and(eq(aiRuns.userId, userId), eq(aiRuns.kind, "plan"), gte(aiRuns.createdAt, day)));
  const [tokens] = await db
    .select({ n: sum(sql`${aiRuns.inputTokens} + ${aiRuns.outputTokens}`) })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, day));
  const [help] = await db
    .select({ n: count() })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.userId, userId),
        sql`${aiRuns.kind} not in ('questions', 'plan', 'page')`,
        gte(aiRuns.createdAt, hour),
      ),
    );
  return {
    batchesToday: batches?.n ?? 0,
    tokensToday: Number(tokens?.n ?? 0),
    helpLastHour: help?.n ?? 0,
  };
}

// Rows older than the retention (B10: 180 days). Returns how many went.
export async function deleteOldAiRuns(db: Executor, before: Date): Promise<number> {
  const removed = await db
    .delete(aiRuns)
    .where(lt(aiRuns.createdAt, before))
    .returning({ id: aiRuns.id });
  return removed.length;
}

// ── Batches ──────────────────────────────────────────────────────────────────────────────────

export async function createAiBatch(db: Executor, createdBy: string): Promise<string> {
  const [row] = await db.insert(aiBatches).values({ createdBy }).returning({ id: aiBatches.id });
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

export async function getAiBatch(db: Executor, id: string): Promise<AiBatch | undefined> {
  return db.query.aiBatches.findFirst({ where: { id } });
}

// The source ref of a page the assistant wrote for a batch.
export const aiSourceRef = (batchId: string, ref: string) => `ai:${batchId}:${ref}`;

export interface AiBatchEntry {
  id: string;
  ref: string;
  title: string;
  path: string;
  status: "draft" | "scheduled" | "published";
  inTrash: boolean;
  // Saved by a person since the assistant wrote it.
  edited: boolean;
}

// The entries a batch has written, in the order they were created.
export async function listAiBatchEntries(db: Executor, batchId: string): Promise<AiBatchEntry[]> {
  const prefix = aiSourceRef(batchId, "");
  const rows = await db
    .select({
      id: entries.id,
      sourceRef: entries.sourceRef,
      title: entries.title,
      path: entries.path,
      status: entries.status,
      deletedAt: entries.deletedAt,
      createdAt: entries.createdAt,
      updatedAt: entries.updatedAt,
    })
    .from(entries)
    .where(like(entries.sourceRef, `${prefix}%`))
    .orderBy(entries.createdAt)
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    ref: (row.sourceRef ?? "").slice(prefix.length),
    title: row.title,
    path: row.path,
    status: row.status,
    inTrash: row.deletedAt !== null,
    // A second can pass between the insert and its first revision.
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > 2000,
  }));
}

export interface FinishAiBatch {
  batchId: string;
  menus?: { primary: Menu; footer: Menu } | undefined;
  homepageEntryId?: string | undefined;
  site?: { title: string; tagline: string } | undefined;
}

export type FinishAiBatchResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "finished" | "discarded" | "invalid" };

class Refused extends Error {
  constructor(readonly error: "invalid") {
    super(error);
  }
}

// Applies what the admin ticked, and keeps what it replaced, in one transaction.
export async function finishAiBatch(
  db: Executor,
  input: FinishAiBatch,
): Promise<FinishAiBatchResult> {
  try {
    return await db.transaction(async (tx) => {
      const [batch] = await tx
        .select()
        .from(aiBatches)
        .where(eq(aiBatches.id, input.batchId))
        .for("update");
      if (!batch) return { ok: false, error: "not-found" } as const;
      if (batch.discardedAt) return { ok: false, error: "discarded" } as const;
      if (batch.finishedAt) return { ok: false, error: "finished" } as const;

      const undo: AiBatchUndo = { menus: null };
      if (input.menus) {
        undo.menus = { primary: await getMenu(tx, "primary"), footer: await getMenu(tx, "footer") };
        for (const location of ["primary", "footer"] as const) {
          if (!(await saveMenu(tx, location, input.menus[location])).ok)
            throw new Refused("invalid");
        }
      }
      if (input.homepageEntryId !== undefined) {
        const reading = await getReading(tx);
        undo.homepageEntryId = reading.homepageEntryId;
        const saved = await upsertSettings(tx, "reading", {
          ...reading,
          homepageEntryId: input.homepageEntryId,
        });
        if (!saved.ok) throw new Refused("invalid");
      }
      if (input.site) {
        const site = await getSettings(tx, "site");
        if (!site) throw new Refused("invalid");
        undo.site = { title: site.title, tagline: site.tagline };
        const saved = await upsertSettings(tx, "site", { ...site, ...input.site });
        if (!saved.ok) throw new Refused("invalid");
      }
      await tx
        .update(aiBatches)
        .set({ finishedAt: new Date(), undo })
        .where(eq(aiBatches.id, input.batchId));
      return { ok: true } as const;
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.error };
    throw error;
  }
}

export type DiscardAiBatchResult =
  | { ok: true; trashed: number; kept: AiBatchEntry[] }
  | { ok: false; error: "not-found" | "discarded" };

// Moves the batch's pages to the trash and puts back what finishing changed. Pages a person
// has saved or published since are kept unless `includeEdited`; the caller asks first.
export async function discardAiBatch(
  db: Executor,
  batchId: string,
  includeEdited: boolean,
): Promise<DiscardAiBatchResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(aiBatches)
      .where(eq(aiBatches.id, batchId))
      .for("update");
    if (!batch) return { ok: false, error: "not-found" } as const;
    if (batch.discardedAt) return { ok: false, error: "discarded" } as const;

    const written = (await listAiBatchEntries(tx, batchId)).filter((e) => !e.inTrash);
    const kept = includeEdited ? [] : written.filter((e) => e.edited || e.status !== "draft");
    const trash = written.filter((e) => !kept.includes(e));
    const now = new Date();
    for (const entry of trash) {
      await tx
        .update(entries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entries.id, entry.id), isNull(entries.deletedAt)));
    }

    const undo = batch.undo;
    if (undo?.menus) {
      await saveMenu(tx, "primary", undo.menus.primary);
      await saveMenu(tx, "footer", undo.menus.footer);
    }
    if (undo?.homepageEntryId !== undefined) {
      const reading = await getReading(tx);
      await upsertSettings(tx, "reading", { ...reading, homepageEntryId: undo.homepageEntryId });
    }
    if (undo?.site) {
      const site = await getSettings(tx, "site");
      if (site) await upsertSettings(tx, "site", { ...site, ...undo.site });
    }
    await tx.update(aiBatches).set({ discardedAt: now }).where(eq(aiBatches.id, batchId));
    return { ok: true, trashed: trash.length, kept } as const;
  });
}
