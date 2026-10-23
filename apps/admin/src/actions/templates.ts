// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { randomUUID } from "node:crypto";
import { can } from "@sitebuilder/auth";
import { newBlockId } from "@sitebuilder/blocks";
import { validateContent } from "@sitebuilder/blocks/server";
import {
  activateTemplate as activate,
  db,
  findTakenPaths,
  getReading,
  getTemplateSettings,
  listImportedEntries,
  upsertSettings,
} from "@sitebuilder/db";
import {
  MENU_LOCATIONS,
  optionValues,
  type TemplateOptionValues,
  TemplateSlug,
} from "@sitebuilder/schema";
import { findTemplate } from "@sitebuilder/templates/admin";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";
import { buildActivation, type PlannedEntry, planStarter } from "@/server/template-plan";
import "@/lib/template-blocks";

// The Templates screen (design §14, docs/templates_and_ai_design.md A7). Only admins activate a
// template (template.activate); it can write the theme, pages, menus and the home page at once.

export type TemplatePreview =
  | {
      ok: true;
      // Each starter entry, and whether a number will be added to its address.
      entries: (PlannedEntry & { numbered: boolean })[];
      hasTheme: boolean;
      hasMenus: boolean;
      // What "Its home page" sets: one of its pages, the latest posts, or nothing.
      home: "page" | "posts" | null;
    }
  | { ok: false; error: string };

const NOT_ALLOWED = "Only an admin can change the site's template.";
const SIGNED_OUT = "Your session has ended. Sign in again.";

// What activating would create, before anything is written: the dry run in the dialog.
export async function previewTemplateActivation(slug: unknown): Promise<TemplatePreview> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: SIGNED_OUT };
  if (!can(viewer, "template.activate")) return { ok: false, error: NOT_ALLOWED };
  const parsed = v.safeParse(TemplateSlug, slug);
  const template = parsed.success ? findTemplate(parsed.output) : undefined;
  if (!template) return { ok: false, error: "That template isn't installed." };

  const { starter, manifest } = template;
  if (!starter) {
    return {
      ok: true,
      entries: [],
      hasTheme: Boolean(manifest.theme),
      hasMenus: false,
      home: null,
    };
  }
  const [imported, reading] = await Promise.all([
    listImportedEntries(db, manifest.slug),
    getReading(db),
  ]);
  const plan = planStarter(manifest.slug, starter, imported, reading.postsPath, randomUUID);
  const taken = await findTakenPaths(
    db,
    plan.entries.filter((entry) => entry.state === "new").map((entry) => entry.path),
  );
  return {
    ok: true,
    entries: plan.entries.map((entry) => ({
      ...entry,
      numbered: entry.state === "new" && taken.has(entry.path),
    })),
    hasTheme: Boolean(manifest.theme),
    hasMenus: Boolean(starter.menus),
    home: starter.homeRef === undefined ? "posts" : "page",
  };
}

const ActivationInput = v.object({
  slug: TemplateSlug,
  theme: v.boolean(),
  starter: v.boolean(),
  menus: v.boolean(),
  home: v.boolean(),
  publish: v.boolean(),
});

export type ActivateTemplateResult =
  | { ok: true; created: number; publishedTo: string | null }
  | { ok: false; error: string };

export async function activateTemplate(input: unknown): Promise<ActivateTemplateResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: SIGNED_OUT };
  if (!can(viewer, "template.activate")) return { ok: false, error: NOT_ALLOWED };
  const parsed = v.safeParse(ActivationInput, input);
  if (!parsed.success) return { ok: false, error: "Those choices aren't complete." };
  const { slug, ...choices } = parsed.output;
  const template = findTemplate(slug);
  if (!template) return { ok: false, error: "That template isn't installed." };

  const [imported, reading] = await Promise.all([listImportedEntries(db, slug), getReading(db)]);
  const plan = template.starter
    ? planStarter(slug, template.starter, imported, reading.postsPath, randomUUID)
    : { entries: [], ids: new Map(), slugs: new Map() };
  const built = buildActivation({
    template,
    plan,
    choices,
    actorId: viewer.id,
    validate: validateContent,
    makeBlockId: newBlockId,
  });
  if (!built.ok) return built;

  const result = await activate(db, built.activation);
  if (!result.ok) {
    const which = "sourceRef" in result ? ` (${result.sourceRef.split(":").pop()})` : "";
    return {
      ok: false,
      error:
        result.error === "path-taken"
          ? `Another change got there first${which}. Open the dialog again to see what's there now.`
          : `The template couldn't be applied${which}. Nothing was changed.`,
    };
  }
  invalidate("activateTemplate", {
    entryIds: result.created.map((entry) => entry.id),
    menus: built.activation.menus ? MENU_LOCATIONS : [],
  });
  const home = result.created.find((entry) => entry.id === built.activation.homepageEntryId);
  return {
    ok: true,
    created: result.created.length,
    publishedTo: choices.publish && home ? "/" : null,
  };
}

export type TemplateOptionsState =
  | { result: "idle" }
  | { result: "saved"; at: number; message: string; values: TemplateOptionValues }
  | { result: "failed"; message: string };

// The active template's options, from the Templates screen (design A7): checked against its
// manifest, with an option left out or not one of its choices taking its default. A form for
// a template that's no longer the active one is refused rather than saved onto another.
export async function saveTemplateOptions(
  _: TemplateOptionsState,
  form: FormData,
): Promise<TemplateOptionsState> {
  const viewer = await getViewer();
  if (!viewer) return { result: "failed", message: SIGNED_OUT };
  if (!can(viewer, "template.activate")) return { result: "failed", message: NOT_ALLOWED };
  const active = await getTemplateSettings(db);
  const template = findTemplate(active.slug);
  if (!template || form.get("slug") !== active.slug) {
    return {
      result: "failed",
      message: "The site's template changed while this was open. Reload the page.",
    };
  }
  const options = template.manifest.options ?? [];
  const sent = Object.fromEntries(
    options.map((option) => {
      const value = form.get(option.key);
      return [option.key, option.type === "boolean" ? value === "on" : value];
    }),
  );
  const values = optionValues(options, sent);
  const saved = await upsertSettings(db, "template", { slug: active.slug, options: values });
  if (!saved.ok) return { result: "failed", message: "The options couldn't be saved." };
  invalidate("saveTemplateOptions");
  return {
    result: "saved",
    at: Date.now(),
    message: `${template.manifest.name}'s options saved`,
    values,
  };
}
