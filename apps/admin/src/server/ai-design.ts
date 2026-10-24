// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { AiErrorCode, AiProvider, Usage } from "@sitebuilder/ai";
import type { Catalog, MediaChoice, StepResult } from "@sitebuilder/ai/site";
import { allBlocks, BLOCKS, FEATURE_ICON_NAMES } from "@sitebuilder/blocks";
import {
  aiUsage,
  db,
  getSettings,
  getTemplateSettings,
  listMedia,
  recordAiRun,
} from "@sitebuilder/db";
import type { AiSettings } from "@sitebuilder/schema";
import { findTemplate } from "@sitebuilder/templates/admin";
import type { Viewer } from "@/auth/session";
import { aiProvider, savedConnection } from "@/server/ai";
import "@/lib/template-blocks";

// What the "Create with AI" route handlers share (templates_and_ai_design B5, B9): the provider
// from the saved settings, the blocks and media the model may use, the limits, and the record
// of each call. The handlers themselves check the request and the permission first.

// B9: sites designed per user per day, help requests per user per hour, and calls in flight
// per user.
export const BATCHES_PER_DAY = 3;
export const HELP_PER_HOUR = 20;
const CALLS_AT_ONCE = 3;

export type Ready =
  | {
      ok: true;
      settings: AiSettings;
      provider: AiProvider;
      language: string;
    }
  | { ok: false; code: AiErrorCode; message: string };

// The saved provider, or why there isn't one.
export async function readyProvider(): Promise<Ready> {
  const settings = await getSettings(db, "ai");
  if (!settings) {
    return {
      ok: false,
      code: "disabled",
      message: "AI isn't set up. An admin sets it up in Settings, AI.",
    };
  }
  const connection = savedConnection(settings);
  if (!connection) {
    return {
      ok: false,
      code: "disabled",
      message: "The saved AI key can't be read any more. An admin enters it again in Settings, AI.",
    };
  }
  const site = await getSettings(db, "site");
  return {
    ok: true,
    settings,
    provider: aiProvider(connection),
    language: site?.language ?? "en",
  };
}

// The blocks the model may use: the built-in ones, and the active template's (B6), whose
// descriptions go to the model as data.
export async function designCatalog(): Promise<{
  catalog: Catalog;
  template: { name: string; description: string };
}> {
  const active = await getTemplateSettings(db);
  const manifest = findTemplate(active.slug)?.manifest;
  const prefix = `${active.slug}:`;
  return {
    catalog: {
      blocks: BLOCKS,
      templateBlocks: allBlocks().filter((block) => block.type.startsWith(prefix)),
      icons: FEATURE_ICON_NAMES,
    },
    template: {
      name: manifest?.name ?? active.slug,
      description: manifest?.description ?? "",
    },
  };
}

// Up to 30 of the library's newest images (B6), for the picture fields.
export async function designMedia(): Promise<MediaChoice[]> {
  const list = await listMedia(db, {
    kind: "image",
    page: 1,
    size: 50,
    q: "",
    month: "",
    view: "grid",
    uploadedBy: null,
  });
  return list.rows.slice(0, 30).map((row) => ({
    id: row.id,
    kind: "image",
    filename: row.filename,
    alt: row.alt,
  }));
}

export type LimitCheck = { ok: true } | { ok: false; message: string };

// The limits that apply before a call (B9): the site's tokens today, this user's sites today
// (for a plan, which starts one) or help requests this hour, and this user's calls in flight.
export async function checkLimits(
  viewer: Viewer,
  settings: AiSettings,
  call: "plan" | "design" | "help",
): Promise<LimitCheck> {
  const usage = await aiUsage(db, viewer.id);
  if (usage.tokensToday >= settings.dailyTokenLimit) {
    return {
      ok: false,
      message:
        "The site has used today's AI token limit. It starts again at midnight UTC, or an admin can raise it in Settings, AI.",
    };
  }
  if (call === "help" && usage.helpLastHour >= HELP_PER_HOUR) {
    return {
      ok: false,
      message: `You can ask the assistant ${HELP_PER_HOUR} times an hour. Try again a little later.`,
    };
  }
  if (call === "plan" && usage.batchesToday >= BATCHES_PER_DAY) {
    return {
      ok: false,
      message: `You can design ${BATCHES_PER_DAY} sites a day with AI. Try again tomorrow (UTC).`,
    };
  }
  if ((inFlight.get(viewer.id) ?? 0) >= CALLS_AT_ONCE) {
    return {
      ok: false,
      message:
        call === "help"
          ? "Wait for the assistant's other answers first."
          : "Wait for the pages being written to finish.",
    };
  }
  return { ok: true };
}

// Calls in flight per user, in this process (B9: with the database counts, enough to stop a
// burst; a few parallel calls across pods may overshoot slightly, which is acceptable).
const inFlight = new Map<string, number>();

// Runs a step for a user, counting it as in flight, and records it in ai_runs (metadata only).
export async function runStep<T>(
  viewer: Viewer,
  run: {
    kind: "questions" | "plan" | "page" | "rewrite" | "seo" | "alt";
    model: string;
    batchId?: string;
    entryId?: string;
  },
  step: () => Promise<StepResult<T>>,
): Promise<StepResult<T>> {
  inFlight.set(viewer.id, (inFlight.get(viewer.id) ?? 0) + 1);
  const started = Date.now();
  let result: StepResult<T> | undefined;
  try {
    result = await step();
    return result;
  } finally {
    const left = (inFlight.get(viewer.id) ?? 1) - 1;
    if (left > 0) inFlight.set(viewer.id, left);
    else inFlight.delete(viewer.id);
    const usage: Usage = result?.usage ?? { inputTokens: 0, outputTokens: 0 };
    await recordAiRun(db, {
      kind: run.kind,
      userId: viewer.id,
      model: run.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: Date.now() - started,
      errorCode: result?.ok
        ? null
        : (result?.error?.code ?? (result?.issues ? "invalid_output" : "unavailable")),
      ...(run.batchId ? { batchId: run.batchId } : {}),
      ...(run.entryId ? { entryId: run.entryId } : {}),
    });
  }
}
