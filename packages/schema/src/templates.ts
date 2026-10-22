// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { type Block, BlockType, type ContentIssue, MAX_BLOCKS } from "./blocks";
import { ENTRY_LIMITS, Slug } from "./entries";
import type { Menu, MenuItem } from "./menu";
import { TemplateSlug, ThemeSettings } from "./settings";
import { NodeId, Url } from "./shared";

// Templates (design §14, docs/templates_and_ai_design.md part A). A template is a folder with
// template.json, starter content and screenshots; phase 7B adds layouts, styles and blocks.
// Everything here is data, checked by the CLI at build time and again where it's used.

// The template contract's version, which `requires.sitebuilder` is compared with. It moves when
// what a template may contain or receive changes, not with every release.
export const SITEBUILDER_VERSION = "0.1.0";

const SemVer = v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+$/, "Use a version such as 1.0.0"));

// Two forms only: "^1.2.3" (the same major version, or the same minor while the major is 0)
// and ">=1.2.3".
const VersionRange = v.pipe(
  v.string(),
  v.regex(/^(\^|>=)\d+\.\d+\.\d+$/, 'Use a range such as "^0.1.0" or ">=1.2.0"'),
);

function parts(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return [major, minor, patch];
}

function compare(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

// Whether `version` (1.2.3) is in `range` ("^1.2.0" or ">=1.2.0").
export function satisfiesRange(version: string, range: string): boolean {
  if (range.startsWith(">=")) return compare(version, range.slice(2)) >= 0;
  const floor = range.slice(1);
  const [major, minor] = parts(floor);
  const [vMajor, vMinor] = parts(version);
  if (compare(version, floor) < 0 || vMajor !== major) return false;
  return major > 0 || vMinor === minor;
}

// Licences a template may carry: each combines with the app's GPL-2.0-or-later.
export const TEMPLATE_LICENCES = [
  "GPL-2.0-or-later",
  "GPL-3.0-or-later",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC0-1.0",
] as const;

// A path inside the template folder: relative, with no "..", no backslashes and no dotfiles.
const RelativeFile = (extensions: readonly string[]) =>
  v.pipe(
    v.string(),
    v.maxLength(200),
    v.regex(/^(?!\/)(?!.*(^|\/)\.)[A-Za-z0-9_./-]+$/, "Use a relative path inside the folder"),
    v.check(
      (s) => extensions.some((extension) => s.endsWith(extension)),
      `Use a ${extensions.join(", ")} file`,
    ),
  );

export const TemplateManifestSchema = v.strictObject({
  slug: TemplateSlug,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
  version: SemVer,
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
  author: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  licence: v.picklist(TEMPLATE_LICENCES),
  requires: v.strictObject({ sitebuilder: VersionRange, nuvui: VersionRange }),
  // Written to the theme settings when an admin activates it with "Use its colours and type".
  theme: v.optional(ThemeSettings),
  screenshots: v.pipe(
    v.array(
      v.strictObject({
        file: RelativeFile([".png", ".jpg", ".webp", ".avif"]),
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
      }),
    ),
    v.minLength(1),
    v.maxLength(6),
  ),
  starter: v.optional(RelativeFile([".json"])),
  // Phase 7B: layouts, styles, extra blocks and options. Accepted here so a 7B manifest parses;
  // the CLI refuses a template that uses them until 7B (TPL-MANIFEST-005).
  components: v.optional(v.unknown()),
  styles: v.optional(v.unknown()),
  blocks: v.optional(v.unknown()),
  options: v.optional(v.unknown()),
});
export type TemplateManifest = v.InferOutput<typeof TemplateManifestSchema>;

// ── Starter content ──────────────────────────────────────────────────────────────────────────
// Pages, posts and menus written by name (a ref), because their ids don't exist until they're
// imported. A link to another starter entry is { "kind": "entry", "entryId": "ref:about" }.

export const StarterRef = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9-]{0,39}$/, "Use lowercase letters, digits and hyphens"),
);

const Label = v.pipe(v.string(), v.minLength(1), v.maxLength(80));
const children = v.optional(
  v.pipe(
    v.array(
      v.union([
        v.strictObject({ label: Label, ref: StarterRef }),
        v.strictObject({ label: Label, url: Url }),
      ]),
    ),
    v.maxLength(12),
  ),
);
export const StarterMenuItem = v.union([
  v.strictObject({ label: Label, ref: StarterRef, children }),
  v.strictObject({ label: Label, url: Url, children }),
]);
export type StarterMenuItem = v.InferOutput<typeof StarterMenuItem>;

// Blocks as in an entry, except that ids may be left out: the import gives every block a fresh
// one, so a template author doesn't have to invent them.
export interface StarterBlock {
  id?: string | undefined;
  type: string;
  props: Record<string, unknown>;
  children?: StarterBlock[] | undefined;
}

const StarterBlockSchema: v.GenericSchema<StarterBlock> = v.object({
  id: v.optional(NodeId),
  type: BlockType,
  props: v.record(v.string(), v.unknown()),
  children: v.optional(v.array(v.lazy(() => StarterBlockSchema))),
});

const optionalText = (max: number) =>
  v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(max)));

const entryFields = {
  ref: StarterRef,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(ENTRY_LIMITS.title)),
  slug: Slug,
  excerpt: optionalText(ENTRY_LIMITS.excerpt),
  seoTitle: optionalText(ENTRY_LIMITS.seoTitle),
  seoDescription: optionalText(ENTRY_LIMITS.seoDescription),
  content: v.pipe(v.array(StarterBlockSchema), v.maxLength(MAX_BLOCKS)),
};

export const StarterPage = v.strictObject({
  ...entryFields,
  // A page's parent comes earlier in the list, so parents are created first.
  parentRef: v.optional(v.nullable(StarterRef), null),
});
export type StarterPage = v.InferOutput<typeof StarterPage>;

export const StarterPost = v.strictObject(entryFields);
export type StarterPost = v.InferOutput<typeof StarterPost>;

export const StarterContentSchema = v.strictObject({
  pages: v.pipe(v.array(StarterPage), v.minLength(1), v.maxLength(20)),
  posts: v.optional(v.pipe(v.array(StarterPost), v.maxLength(10)), []),
  menus: v.optional(
    v.strictObject({
      primary: v.pipe(v.array(StarterMenuItem), v.maxLength(20)),
      footer: v.pipe(v.array(StarterMenuItem), v.maxLength(20)),
    }),
  ),
  // The page that becomes the home page, if the admin asks for it.
  homeRef: v.optional(StarterRef),
});
export type StarterContent = v.InferOutput<typeof StarterContentSchema>;

const REF_PREFIX = "ref:";

// Every `{ kind: "entry", entryId: "ref:<name>" }` in a value, replaced by the id `ids` gives
// that name. An unknown name is reported with where it is, and left as it was, so the strict
// check that follows rejects it too.
export function resolveRefs<T>(
  value: T,
  ids: ReadonlyMap<string, string>,
  base: (string | number)[] = [],
): { value: T; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const walk = (node: unknown, path: (string | number)[]): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => walk(item, [...path, index]));
    if (node === null || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) out[key] = walk(item, [...path, key]);
    const target = record.entryId;
    if (record.kind === "entry" && typeof target === "string" && target.startsWith(REF_PREFIX)) {
      const id = ids.get(target.slice(REF_PREFIX.length));
      if (id) out.entryId = id;
      else {
        issues.push({
          path: [...path, "entryId"],
          code: "unknown-ref",
          message: `No starter page or post is called "${target.slice(REF_PREFIX.length)}"`,
        });
      }
    }
    return out;
  };
  return { value: walk(value, base) as T, issues };
}

// Starter blocks with an id each, from `makeId`, keeping any id the author wrote.
export function withBlockIds(blocks: readonly StarterBlock[], makeId: () => string): Block[] {
  return blocks.map((block) => ({
    id: block.id ?? makeId(),
    type: block.type,
    props: block.props,
    ...(block.children ? { children: withBlockIds(block.children, makeId) } : {}),
  }));
}

// A starter menu as a stored one: refs become entry links (through `ids`), and every item gets
// an id. Items whose ref is unknown are reported by starterIssues, so here they're dropped.
export function starterMenu(
  items: readonly StarterMenuItem[],
  ids: ReadonlyMap<string, string>,
  makeId: () => string,
): Menu {
  type Link = { label: string; ref: string } | { label: string; url: string };
  const link = (item: Link) => {
    if ("url" in item)
      return { id: makeId(), label: item.label, kind: "url" as const, url: item.url };
    const entryId = ids.get(item.ref);
    return entryId ? { id: makeId(), label: item.label, kind: "entry" as const, entryId } : null;
  };
  const menu: MenuItem[] = [];
  for (const item of items) {
    const top = link(item);
    if (!top) continue;
    const kids = (item.children ?? []).flatMap((child) => link(child) ?? []);
    menu.push(kids.length > 0 ? { ...top, children: kids } : top);
  }
  return menu;
}

// What the schema can't say: refs are unique, a parent comes before its child and is a page,
// the home page is a page, and every ref in menus and links names a starter entry.
export function starterIssues(content: StarterContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const pageRefs = new Set<string>();
  const all = new Map<string, string>();
  content.pages.forEach((page, index) => {
    if (all.has(page.ref)) {
      issues.push({
        path: ["pages", index, "ref"],
        code: "duplicate-ref",
        message: `"${page.ref}" is used twice`,
      });
    }
    if (page.parentRef !== null && !pageRefs.has(page.parentRef)) {
      issues.push({
        path: ["pages", index, "parentRef"],
        code: "unknown-parent",
        message: `The parent "${page.parentRef}" must be a page listed before this one`,
      });
    }
    pageRefs.add(page.ref);
    all.set(page.ref, page.ref);
  });
  content.posts.forEach((post, index) => {
    if (all.has(post.ref)) {
      issues.push({
        path: ["posts", index, "ref"],
        code: "duplicate-ref",
        message: `"${post.ref}" is used twice`,
      });
    }
    all.set(post.ref, post.ref);
  });
  if (content.homeRef !== undefined && !pageRefs.has(content.homeRef)) {
    issues.push({
      path: ["homeRef"],
      code: "unknown-ref",
      message: `The home page "${content.homeRef}" isn't a starter page`,
    });
  }
  for (const location of ["primary", "footer"] as const) {
    (content.menus?.[location] ?? []).forEach((item, index) => {
      const refs = [item, ...(item.children ?? [])];
      refs.forEach((link, depth) => {
        if ("ref" in link && !all.has(link.ref)) {
          issues.push({
            path: ["menus", location, index, ...(depth > 0 ? ["children", depth - 1] : [])],
            code: "unknown-ref",
            message: `No starter page or post is called "${link.ref}"`,
          });
        }
      });
    });
  }
  content.pages.forEach((page, index) => {
    issues.push(...resolveRefs(page.content, all, ["pages", index, "content"]).issues);
  });
  content.posts.forEach((post, index) => {
    issues.push(...resolveRefs(post.content, all, ["posts", index, "content"]).issues);
  });
  return issues;
}
