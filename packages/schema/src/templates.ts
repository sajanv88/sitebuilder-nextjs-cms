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

// ── Phase 7B: layouts, styles, options and blocks ────────────────────────────────────────────

// The layouts a template draws the public site with (design §14). Site and Page are required;
// one left out is drawn with the default template's.
export const TemplateComponents = v.strictObject({
  site: RelativeFile([".tsx"]),
  page: RelativeFile([".tsx"]),
  post: v.optional(RelativeFile([".tsx"])),
  archive: v.optional(RelativeFile([".tsx"])),
  notFound: v.optional(RelativeFile([".tsx"])),
});
export type TemplateComponents = v.InferOutput<typeof TemplateComponents>;
export const LAYOUT_NAMES = ["site", "page", "post", "archive", "notFound"] as const;
export type LayoutName = (typeof LAYOUT_NAMES)[number];

// The stylesheet, compiled ahead of time to one static file (decisions #110).
export const TemplateStyles = v.strictObject({ entry: RelativeFile([".css", ".scss"]) });
export type TemplateStyles = v.InferOutput<typeof TemplateStyles>;

// An option an admin sets on the Templates screen: on or off, or one of a few choices. Every
// layout gets the values (design §14).
const OptionKey = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-zA-Z0-9]{0,39}$/, "Use a name such as stickyHeader"),
);
const ShortText = (max: number) => v.pipe(v.string(), v.minLength(1), v.maxLength(max));
const Choices = v.pipe(
  v.array(v.strictObject({ value: OptionKey, label: ShortText(80) })),
  v.minLength(2),
  v.maxLength(12),
);
const OptionText = {
  key: OptionKey,
  label: ShortText(60),
  description: v.optional(ShortText(200)),
};
export const TemplateOption = v.variant("type", [
  v.strictObject({ ...OptionText, type: v.literal("boolean"), default: v.boolean() }),
  v.pipe(
    v.strictObject({
      ...OptionText,
      type: v.literal("choice"),
      choices: Choices,
      default: OptionKey,
    }),
    v.check(
      (option) => option.choices.some((choice) => choice.value === option.default),
      "The default must be one of the choices",
    ),
  ),
]);
export type TemplateOption = v.InferOutput<typeof TemplateOption>;
export type TemplateOptionValues = Readonly<Record<string, boolean | string>>;

// The values to draw with: each option's saved value while it's still valid, its default
// otherwise. Unknown keys are dropped (design A7).
export function optionValues(
  options: readonly TemplateOption[],
  saved: Readonly<Record<string, unknown>>,
): TemplateOptionValues {
  const values: Record<string, boolean | string> = {};
  for (const option of options) {
    const value = saved[option.key];
    if (option.type === "boolean") {
      values[option.key] = typeof value === "boolean" ? value : option.default;
    } else {
      const known = option.choices.some((choice) => choice.value === value);
      values[option.key] = known && typeof value === "string" ? value : option.default;
    }
  }
  return values;
}

// A template's own block (design A9, revised by decisions #112). What it is and how the editor
// edits it are data, here, so the admin can check and edit it without loading template code;
// only drawing it is code, in `component`, which only the site zone loads. Its type is
// "<template slug>:<name>". The fields are a subset of the built-in blocks' (no rich text,
// lists or terms), and a media field's name is mediaId or ends in MediaId (design A9).
const FieldName = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-zA-Z0-9]{0,39}$/, "Use a name such as title"),
);
const FieldBase = {
  name: FieldName,
  label: ShortText(80),
  description: v.optional(ShortText(200)),
};
export const TemplateField = v.variant("kind", [
  v.strictObject({
    ...FieldBase,
    kind: v.literal("text"),
    max: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2000)),
    optional: v.optional(v.boolean()),
    multiline: v.optional(v.boolean()),
  }),
  v.strictObject({ ...FieldBase, kind: v.literal("choice"), options: Choices }),
  v.strictObject({ ...FieldBase, kind: v.literal("toggle") }),
  v.pipe(
    v.strictObject({
      ...FieldBase,
      kind: v.literal("number"),
      min: v.pipe(v.number(), v.integer()),
      max: v.pipe(v.number(), v.integer()),
    }),
    v.check((field) => field.min < field.max, "min must be below max"),
  ),
  v.strictObject({ ...FieldBase, kind: v.literal("link"), optional: v.optional(v.boolean()) }),
  v.strictObject({
    ...FieldBase,
    kind: v.literal("action"),
    max: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(60)),
    optional: v.optional(v.boolean()),
  }),
  v.pipe(
    v.strictObject({
      ...FieldBase,
      kind: v.literal("media"),
      accept: v.picklist(["image", "video", "any"]),
      optional: v.optional(v.boolean()),
    }),
    v.check(
      (field) => field.name === "mediaId" || field.name.endsWith("MediaId"),
      "A media field is named mediaId, or its name ends in MediaId",
    ),
  ),
  v.strictObject({
    ...FieldBase,
    kind: v.literal("alt"),
    max: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
  }),
  v.strictObject({ ...FieldBase, kind: v.literal("icon") }),
]);
export type TemplateField = v.InferOutput<typeof TemplateField>;

export const TemplateBlockName = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9-]{1,30}$/, "Use lowercase letters, digits and hyphens"),
);
export const TemplateBlockDeclaration = v.pipe(
  v.strictObject({
    name: TemplateBlockName,
    label: ShortText(40),
    description: ShortText(120),
    category: v.picklist(["text", "media", "layout", "marketing", "data"]),
    // One of the feature grid's icons (FEATURE_ICON_NAMES in @sitebuilder/blocks).
    icon: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,39}$/)),
    component: RelativeFile([".tsx"]),
    fields: v.pipe(v.array(TemplateField), v.minLength(1), v.maxLength(20)),
    // The props of a block just added.
    defaults: v.record(FieldName, v.unknown()),
    // The text field that names a block in the editor's outline.
    summaryField: v.optional(FieldName),
  }),
  v.check(
    (block) => new Set(block.fields.map((field) => field.name)).size === block.fields.length,
    "Each field needs a name of its own",
  ),
  v.check(
    (block) =>
      block.summaryField === undefined ||
      block.fields.some((field) => field.name === block.summaryField && field.kind === "text"),
    "summaryField must name a text field",
  ),
);
export type TemplateBlockDeclaration = v.InferOutput<typeof TemplateBlockDeclaration>;

// A template block's type, "<template slug>:<name>".
export const templateBlockType = (slug: string, name: string) => `${slug}:${name}`;

export const TemplateManifestSchema = v.strictObject({
  slug: TemplateSlug,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
  version: SemVer,
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
  author: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  licence: v.picklist(TEMPLATE_LICENCES),
  requires: v.strictObject({ sitebuilder: VersionRange, nuvui: VersionRange }),
  // Written to the theme settings when an admin activates it with "Use its colours and type".
  theme: v.optional(v.omit(ThemeSettings, ["pageBackground", "customCss", "fonts"])),
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
  // Without components the default template's layouts draw the site: a data-only template.
  components: v.optional(TemplateComponents),
  styles: v.optional(TemplateStyles),
  blocks: v.optional(
    v.pipe(
      v.array(TemplateBlockDeclaration),
      v.maxLength(20),
      v.check(
        (blocks) => new Set(blocks.map((block) => block.name)).size === blocks.length,
        "Each block needs a name of its own",
      ),
    ),
  ),
  options: v.optional(
    v.pipe(
      v.array(TemplateOption),
      v.maxLength(20),
      v.check(
        (options) => new Set(options.map((option) => option.key)).size === options.length,
        "Each option needs a key of its own",
      ),
    ),
  ),
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
