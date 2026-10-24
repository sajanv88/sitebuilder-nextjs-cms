// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  type Block,
  type BlockListResult,
  type ContentIssue,
  resolveRefs,
  type StarterBlock,
  withBlockIds,
} from "@sitebuilder/schema";
import * as v from "valibot";
import type { AiImage } from "../types";
import { catalogLines, type MediaChoice, pageCatalog, withoutIds, withoutNulls } from "./catalog";
import {
  type AskContext,
  ask,
  type Catalog,
  clip,
  mediaLines,
  type StepResult,
  valibotIssues,
} from "./design";
import { inventedFacts, knownFacts } from "./facts";
import { fence } from "./fence";
import { designIssues } from "./lint";
import {
  ALT_SCHEMA,
  altSystem,
  rewriteSchema,
  rewriteSystem,
  SEO_SCHEMA,
  seoSystem,
} from "./prompts";

// Help on a page in the editor (phase 8 plan, 8.7): rewrite blocks from an instruction, suggest
// what search engines show, write a picture's alt text. Each answer is checked like a designed
// page's, repaired once, and goes back to the editor as a proposal: nothing here saves it.

export interface HelpContext extends AskContext {
  // The site's language tag.
  language: string;
}

// Output token caps (B9).
const MAX_TOKENS = { rewrite: 8000, seo: 600, alt: 300 } as const;

const CONTAINERS = new Set(["section", "columns", "column"]);

const has = (blocks: readonly Block[], test: (block: Block) => boolean): boolean =>
  blocks.some((block) => test(block) || has(block.children ?? [], test));

function typesIn(blocks: readonly Block[], into = new Set<string>()): Set<string> {
  for (const block of blocks) {
    into.add(block.type);
    typesIn(block.children ?? [], into);
  }
  return into;
}

// Links to the site's own entries, as refs the model can keep ("p1", "p2"), and back.
function withRefs(blocks: readonly Block[]): { value: unknown; ids: Map<string, string> } {
  const refs = new Map<string, string>();
  const ids = new Map<string, string>();
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) out[key] = walk(item);
    const record = node as Record<string, unknown>;
    if (record.kind === "entry" && typeof record.entryId === "string") {
      let ref = refs.get(record.entryId);
      if (!ref) {
        ref = `p${refs.size + 1}`;
        refs.set(record.entryId, ref);
        ids.set(ref, record.entryId);
      }
      out.entryId = `ref:${ref}`;
    }
    return out;
  };
  return { value: walk(blocks), ids };
}

// ── Rewrite ──────────────────────────────────────────────────────────────────────────────────

export interface RewriteJob {
  title: string;
  instruction: string;
  // What to rewrite: the selected block, or every block of the page.
  blocks: readonly Block[];
  // Inside a section or a column: what replaces it must be blocks a section holds.
  nested: boolean;
  // The whole page's text, for what the rewrite may say (its facts) and for context.
  pageText: string;
  // Titles of the entries the blocks link to, by id.
  linkTitles: ReadonlyMap<string, string>;
  catalog: Catalog;
  // The pictures the blocks use and the library's, which the rewrite may use.
  media: readonly MediaChoice[];
  makeId: () => string;
  // validateBlockList with the registered rules and the server's HTML cleaner.
  validate: (blocks: Block[]) => BlockListResult;
}

const RewriteAnswer = v.object({ blocks: v.pipe(v.array(v.unknown()), v.minLength(1)) });

export function rewriteBlocks(
  context: HelpContext,
  job: RewriteJob,
): Promise<StepResult<{ blocks: Block[] }>> {
  const all = [...job.catalog.blocks, ...job.catalog.templateBlocks];
  const linked = withRefs(job.blocks);
  const refs = [...linked.ids.keys()];
  // The types the blocks are made of, with a heading and text; only leaves inside a section.
  const only = [...typesIn(job.blocks), "heading", "rich-text"].filter(
    (type) => type !== "column" && !(job.nested && CONTAINERS.has(type)),
  );
  const schema = pageCatalog(all, { media: job.media, refs, icons: job.catalog.icons }, only);
  const current = JSON.stringify(withoutIds(linked.value));
  const known = knownFacts([job.title, job.instruction, job.pageText, current]);
  const single = job.blocks.length === 1;

  const data = fence();
  const pages = refs.map((ref) => `${ref}: ${job.linkTitles.get(linked.ids.get(ref) ?? "") ?? ""}`);
  const user = [
    data.data("page-title", job.title, 300),
    single ? data.data("page", job.pageText, 6000) : "",
    data.data("current-blocks", current, 40_000),
    pages.length ? data.data("linked-pages", pages.join("\n"), 2000) : "",
    job.media.length ? data.data("media-list", mediaLines(job.media), 6000) : "",
    data.data("instruction", job.instruction, 2000),
    `Rewrite the ${single ? "block" : "blocks"} in "current-blocks" as the instruction asks.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return ask(
    context,
    rewriteSystem(context.language, catalogLines(job.catalog.blocks, schema.types)),
    user,
    { name: "blocks", schema: rewriteSchema(schema.list, schema.defs) },
    MAX_TOKENS.rewrite,
    (value) => {
      const answer = v.safeParse(RewriteAnswer, value);
      if (!answer.success) return { ok: false, issues: valibotIssues(answer.issues) };
      const raw = withoutNulls(answer.output.blocks) as unknown[];
      // Fresh ids (B6: the model's are never kept), the refs back to the entries they were.
      const blocks = withBlockIds(withoutIds(raw) as StarterBlock[], job.makeId);
      const resolved = resolveRefs(blocks, linked.ids, ["blocks"]);
      const validated = job.validate(resolved.value);
      const issues: ContentIssue[] = [...resolved.issues];
      if (!validated.ok) {
        issues.push(...validated.issues.map((i) => ({ ...i, path: ["blocks", ...i.path] })));
      }
      if (job.nested && has(resolved.value, (block) => CONTAINERS.has(block.type))) {
        issues.push({
          path: ["blocks"],
          code: "invalid-answer",
          message: "These blocks go inside a section: no section or columns here",
        });
      }
      issues.push(...inventedFacts(raw, known));
      // One block has no neighbours: how it sits among others isn't its to fix.
      issues.push(
        ...designIssues(raw).filter(
          (issue) =>
            !single || (issue.code !== "empty-heading" && issue.code !== "text-after-text"),
        ),
      );
      if (issues.length > 0 || !validated.ok) return { ok: false, issues };
      return { ok: true, value: { blocks: validated.value } };
    },
  );
}

// ── What search engines show ─────────────────────────────────────────────────────────────────

export interface SeoSuggestion {
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
}

const noMarker = (s: string) => !/\[TODO\b/i.test(s);

const SeoAnswer = v.object({
  seoTitle: v.pipe(
    v.string(),
    v.transform((s) => clip(s, 70)),
    v.minLength(1),
    v.check(noMarker, "No [TODO] markers"),
  ),
  seoDescription: v.pipe(
    v.string(),
    v.transform((s) => clip(s, 160)),
    v.minLength(1),
    v.check(noMarker, "No [TODO] markers"),
  ),
  excerpt: v.pipe(
    v.string(),
    v.transform((s) => clip(s, 200)),
    v.check(noMarker, "No [TODO] markers"),
  ),
});

export function suggestSeo(
  context: HelpContext,
  page: { title: string; text: string },
): Promise<StepResult<SeoSuggestion>> {
  const known = knownFacts([page.title, page.text]);
  const data = fence();
  const user = [
    data.data("page", `Title: ${page.title}\n\n${page.text}`, 12_000),
    'Suggest the search title, description and excerpt for the page in "page".',
  ].join("\n\n");
  return ask(
    context,
    seoSystem(context.language),
    user,
    { name: "seo", schema: SEO_SCHEMA },
    MAX_TOKENS.seo,
    (value) => {
      const answer = v.safeParse(SeoAnswer, value);
      if (!answer.success) return { ok: false, issues: valibotIssues(answer.issues) };
      const issues = inventedFacts(answer.output, known);
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: answer.output };
    },
  );
}

// ── Alt text ─────────────────────────────────────────────────────────────────────────────────

export interface AltJob {
  image: AiImage;
  filename: string;
  pageTitle: string;
  // What's around the picture, so the alt says what matters there.
  pageText: string;
  // The alt field's limit.
  max: number;
}

export function describeImage(
  context: HelpContext,
  job: AltJob,
): Promise<StepResult<{ alt: string }>> {
  const Answer = v.object({
    alt: v.pipe(
      v.string(),
      v.transform((s) => clip(s, job.max)),
      v.check(noMarker, "No [TODO] markers"),
    ),
    decorative: v.boolean(),
  });
  const data = fence();
  const user = [
    data.data("page", `Title: ${job.pageTitle}\n\n${job.pageText}`, 3000),
    data.data("file-name", job.filename, 200),
    "Write the alt text for the picture sent with this message.",
  ].join("\n\n");
  return ask(
    context,
    altSystem(context.language, job.max),
    user,
    { name: "alt_text", schema: ALT_SCHEMA },
    MAX_TOKENS.alt,
    (value) => {
      const answer = v.safeParse(Answer, value);
      if (!answer.success) return { ok: false, issues: valibotIssues(answer.issues) };
      const { alt, decorative } = answer.output;
      if (!decorative && !alt) {
        return {
          ok: false,
          issues: [{ path: ["alt"], code: "invalid-answer", message: "Write the alt text" }],
        };
      }
      return { ok: true, value: { alt: decorative ? "" : alt } };
    },
    [job.image],
  );
}
