// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ImportedEntry, TemplateActivation, TemplateEntryWrite } from "@sitebuilder/db";
import {
  type BlockListResult,
  type EntryKind,
  isReservedPostSlug,
  isReservedRootSlug,
  pagePath,
  postPath,
  resolveRefs,
  type StarterContent,
  starterMenu,
  withBlockIds,
  withSuffix,
} from "@sitebuilder/schema";
import type { GeneratedTemplate } from "@sitebuilder/templates/admin";

// What activating a template would do (design §14, docs/templates_and_ai_design.md A7, A8),
// worked out from the template, what an earlier activation already imported and the reading
// settings. Pure: the action reads the database, and this decides.

export interface ActivationChoices {
  // Write the template's theme to Appearance.
  theme: boolean;
  // Create its starter pages and posts.
  starter: boolean;
  menus: boolean;
  home: boolean;
  // Publish what's created, instead of leaving drafts.
  publish: boolean;
}

// "new": created by this activation. "added": an earlier one made it, so it's left alone.
// "trashed": an earlier one made it and it's in the trash, so it isn't made again.
export type EntryState = "new" | "added" | "trashed";

export interface PlannedEntry {
  ref: string;
  type: EntryKind;
  title: string;
  // Where it is, or where it will be unless that's taken (then a number is added).
  path: string;
  state: EntryState;
}

export interface StarterPlan {
  entries: PlannedEntry[];
  // Each starter ref's entry id: the existing one, or the one it will be created with.
  ids: Map<string, string>;
  // The slug each new entry asks for.
  slugs: Map<string, string>;
}

export const sourceRefOf = (slug: string, ref: string) => `template:${slug}:${ref}`;

export function planStarter(
  slug: string,
  starter: StarterContent,
  imported: readonly ImportedEntry[],
  postsPath: string,
  makeUuid: () => string,
): StarterPlan {
  const before = new Map(imported.map((entry) => [entry.sourceRef, entry]));
  const entries: PlannedEntry[] = [];
  const ids = new Map<string, string>();
  const slugs = new Map<string, string>();
  const paths = new Map<string, string>();

  const plan = (
    ref: string,
    type: EntryKind,
    title: string,
    path: (requested: string) => string,
    requested: string,
  ) => {
    const existing = before.get(sourceRefOf(slug, ref));
    if (existing) {
      ids.set(ref, existing.id);
      paths.set(ref, existing.path);
      entries.push({
        ref,
        type,
        title: existing.title,
        path: existing.path,
        state: existing.trashed ? "trashed" : "added",
      });
      return;
    }
    ids.set(ref, makeUuid());
    slugs.set(ref, requested);
    paths.set(ref, path(requested));
    entries.push({ ref, type, title, path: path(requested), state: "new" });
  };

  for (const page of starter.pages) {
    const parentPath = page.parentRef === null ? null : (paths.get(page.parentRef) ?? null);
    // A root page can't take a reserved segment or the blog's; it asks for the next number.
    const reserved = parentPath === null && isReservedRootSlug(page.slug, postsPath);
    plan(
      page.ref,
      "page",
      page.title,
      (s) => pagePath(parentPath, s),
      reserved ? withSuffix(page.slug, 2) : page.slug,
    );
  }
  for (const post of starter.posts) {
    const requested = isReservedPostSlug(post.slug) ? withSuffix(post.slug, 2) : post.slug;
    plan(post.ref, "post", post.title, (s) => postPath(postsPath, s), requested);
  }
  return { entries, ids, slugs };
}

export type BuildResult =
  | { ok: true; activation: TemplateActivation }
  | { ok: false; error: string };

export function buildActivation(input: {
  template: GeneratedTemplate;
  plan: StarterPlan;
  choices: ActivationChoices;
  actorId: string;
  validate: (content: unknown) => BlockListResult;
  makeBlockId: () => string;
}): BuildResult {
  const { template, plan, choices } = input;
  const { manifest, starter } = template;
  const entries: TemplateEntryWrite[] = [];
  // Entries that will exist and be live afterwards: links and menus point only at these.
  const live = new Map<string, string>();

  if (starter) {
    for (const entry of plan.entries) {
      const id = plan.ids.get(entry.ref);
      if (!id) continue;
      if (entry.state === "added" || (entry.state === "new" && choices.starter))
        live.set(entry.ref, id);
    }
  }

  if (starter && choices.starter) {
    const sources = [
      ...starter.pages.map((page) => ({ ...page, type: "page" as const })),
      ...starter.posts.map((post) => ({ ...post, type: "post" as const, parentRef: null })),
    ];
    for (const source of sources) {
      const planned = plan.entries.find((entry) => entry.ref === source.ref);
      const id = plan.ids.get(source.ref);
      if (planned?.state !== "new" || !id) continue;
      const blocks = withBlockIds(source.content, input.makeBlockId);
      // Links resolve against every starter entry's id; one to an entry that won't be there
      // (trashed) still points at its id and shows as plain text on the site.
      const resolved = resolveRefs(blocks, plan.ids).value;
      const checked = input.validate(resolved);
      if (!checked.ok)
        return { ok: false, error: `The template's "${source.title}" isn't valid content.` };
      entries.push({
        id,
        sourceRef: sourceRefOf(manifest.slug, source.ref),
        type: source.type,
        parentId: source.parentRef === null ? null : (plan.ids.get(source.parentRef) ?? null),
        title: source.title,
        slug: plan.slugs.get(source.ref) ?? source.slug,
        excerpt: source.excerpt ?? null,
        seoTitle: source.seoTitle ?? null,
        seoDescription: source.seoDescription ?? null,
        content: checked.value,
      });
    }
  }

  // A template without a home page of its own has the latest posts there.
  const homepageEntryId =
    !choices.home || !starter
      ? undefined
      : starter.homeRef === undefined
        ? null
        : live.get(starter.homeRef);
  const activation: TemplateActivation = {
    actorId: input.actorId,
    template: { slug: manifest.slug, options: {} },
    ...(choices.theme && manifest.theme ? { theme: manifest.theme } : {}),
    entries,
    publish: choices.publish && entries.length > 0,
    ...(choices.menus && starter?.menus
      ? {
          menus: {
            primary: starterMenu(starter.menus.primary, live, input.makeBlockId),
            footer: starterMenu(starter.menus.footer, live, input.makeBlockId),
          },
        }
      : {}),
    ...(homepageEntryId !== undefined ? { homepageEntryId } : {}),
  };
  return { ok: true, activation };
}
