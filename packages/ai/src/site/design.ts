// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  AiInterview,
  type Block,
  type BlockListResult,
  type ContentIssue,
  type AiInterview as Interview,
  type SitePlan as Plan,
  resolveRefs,
  SitePlan,
  type StarterBlock,
  withBlockIds,
} from "@sitebuilder/schema";
import * as v from "valibot";
import type { AiError, AiImage, AiMessage, AiProvider, Usage } from "../types";
import {
  type BlockSpec,
  catalogLines,
  type MediaChoice,
  pageCatalog,
  withoutIds,
  withoutNulls,
} from "./catalog";
import { countTodos, inventedFacts, knownFacts } from "./facts";
import { fence } from "./fence";
import { designIssues } from "./lint";
import {
  INTERVIEW_SCHEMA,
  interviewSystem,
  pageSchema,
  pageSystem,
  planSchema,
  planSystem,
  REPAIR_REQUEST,
} from "./prompts";

// Designing a site with the assistant (phase 8 plan, 8.0): questions, a plan, then each page.
// Each step validates the model's answer and, when it fails, asks once more with the problems
// (B7). No Next.js and no database: the caller passes the provider, the blocks, the media and
// the content validator.

// Output token caps (B9).
const MAX_TOKENS = { interview: 2000, plan: 4000, page: 8000 } as const;

export interface Answered {
  question: string;
  answer: string | readonly string[];
}

export interface DesignContext {
  provider: AiProvider;
  model: string;
  // The site's language tag.
  language: string;
  // What the owner wrote.
  brief: string;
  signal?: AbortSignal;
}

// What `ask` needs: the design steps' context, and help on a page's (help.ts).
export type AskContext = Pick<DesignContext, "provider" | "model" | "signal">;

// `repaired`: what was wrong with the first answer, when a second was asked for.
export type StepResult<T> =
  | { ok: true; value: T; attempts: number; usage: Usage; repaired?: ContentIssue[] }
  | {
      ok: false;
      error?: AiError;
      issues?: ContentIssue[];
      attempts: number;
      usage: Usage;
      repaired?: ContentIssue[];
    };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

export const NONE: Usage = { inputTokens: 0, outputTokens: 0 };

// The problems with an answer, as a list for the repair: at most 20 (B7).
function problems(issues: readonly ContentIssue[]): string {
  return issues
    .slice(0, 20)
    .map((issue) => `- at ${issue.path.join(".") || "(top)"}: ${issue.message}`)
    .join("\n");
}

export const valibotIssues = (issues: readonly v.BaseIssue<unknown>[]): ContentIssue[] =>
  issues.map((issue) => ({
    path: (issue.path ?? []).map((item) =>
      typeof item.key === "number" ? item.key : String(item.key),
    ),
    code: "invalid-answer",
    message: issue.message,
  }));

// Asks, checks the answer with `check`, and asks once more with the problems if it fails.
// `images` go with the first question, for a model that takes them.
export async function ask<T>(
  context: AskContext,
  system: string,
  user: string,
  output: { name: string; schema: Record<string, unknown> },
  maxOutputTokens: number,
  check: (value: unknown) => { ok: true; value: T } | { ok: false; issues: ContentIssue[] },
  images?: readonly AiImage[],
): Promise<StepResult<T>> {
  const messages: AiMessage[] = [
    { role: "user", content: user, ...(images?.length ? { images } : {}) },
  ];
  let usage = NONE;
  let repaired: ContentIssue[] | undefined;
  const extra = () => (repaired ? { repaired } : {});
  for (let attempt = 1; attempt <= 2; attempt++) {
    const answer = await context.provider.generate({
      model: context.model,
      system,
      messages,
      output,
      maxOutputTokens,
      ...(context.signal ? { signal: context.signal } : {}),
    });
    if (!answer.ok) {
      return { ok: false, error: answer.error, attempts: attempt, usage, ...extra() };
    }
    usage = addUsage(usage, answer.value.usage);
    const checked = check(answer.value.value);
    if (checked.ok) {
      return { ok: true, value: checked.value, attempts: attempt, usage, ...extra() };
    }
    if (attempt === 2) {
      return { ok: false, issues: checked.issues, attempts: attempt, usage, ...extra() };
    }
    repaired = checked.issues;
    // The repair: the answer back as the model's own turn, then the problems, fenced (they
    // quote the answer, which may quote the owner).
    const data = fence();
    messages.push(
      { role: "assistant", content: JSON.stringify(answer.value.value) },
      {
        role: "user",
        content: `${data.data("problems", problems(checked.issues), 8000)}\n\n${REPAIR_REQUEST}`,
      },
    );
  }
  return { ok: false, attempts: 2, usage };
}

// ── 1. Questions ─────────────────────────────────────────────────────────────────────────────

export function askQuestions(
  context: DesignContext,
  template: { name: string; description: string },
): Promise<StepResult<Interview>> {
  const data = fence();
  const user = [
    data.data("site-description", context.brief, 3000),
    data.data("template", `${template.name}: ${template.description}`, 400),
    "Ask your questions about this website, if any.",
  ].join("\n\n");
  return ask(
    context,
    interviewSystem(context.language),
    user,
    { name: "questions", schema: INTERVIEW_SCHEMA },
    MAX_TOKENS.interview,
    (value) => {
      const parsed = v.safeParse(AiInterview, value);
      return parsed.success
        ? { ok: true, value: parsed.output }
        : { ok: false, issues: valibotIssues(parsed.issues) };
    },
  );
}

// The owner's answers as text for the next prompts.
export function answersText(answers: readonly Answered[]): string {
  return answers
    .map(({ question, answer }) => {
      const text = typeof answer === "string" ? answer : answer.join("; ");
      return `Q: ${question}\nA: ${text.trim() || "(no answer)"}`;
    })
    .join("\n\n");
}

// Block types that alone make a page read as a wall of text.
const PLAIN = new Set(["heading", "rich-text", "button", "spacer", "separator", "quote"]);

// ── 2. The plan ──────────────────────────────────────────────────────────────────────────────

export interface Catalog {
  // The built-in blocks.
  blocks: readonly BlockSpec[];
  // The active template's blocks: their descriptions are a template author's, so they go to
  // the model as data.
  templateBlocks: readonly BlockSpec[];
  icons: readonly string[];
}

const templateLines = (catalog: Catalog, available: readonly string[]) =>
  catalogLines(catalog.templateBlocks, available);

// The library's files, one a line: id, kind, file name and alt text.
export const mediaLines = (media: readonly MediaChoice[]) =>
  media.map((m) => `${m.id} | ${m.kind} | ${m.filename}${m.alt ? ` | ${m.alt}` : ""}`).join("\n");

export function planSite(
  context: DesignContext,
  answers: readonly Answered[],
  catalog: Catalog,
  media: readonly MediaChoice[],
): Promise<StepResult<Plan>> {
  const all = [...catalog.blocks, ...catalog.templateBlocks];
  // The block types there are, with these files: picture blocks only when there are pictures.
  const { types } = pageCatalog(all, { media, refs: [], icons: catalog.icons });
  const data = fence();
  const user = [
    data.data("site-description", context.brief, 3000),
    data.data("answers", answersText(answers), 6000),
    media.length ? data.data("media-list", mediaLines(media), 6000) : "",
    templateLines(catalog, types)
      ? data.data("template-blocks", templateLines(catalog, types), 4000)
      : "",
    "Plan this website.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return ask(
    context,
    planSystem(context.language, catalogLines(catalog.blocks, types)),
    user,
    { name: "site_plan", schema: planSchema(types) },
    MAX_TOKENS.plan,
    (value) => {
      const parsed = v.safeParse(SitePlan, value);
      if (!parsed.success) return { ok: false, issues: valibotIssues(parsed.issues) };
      const unknown = parsed.output.pages.flatMap((page, p) =>
        page.sections.flatMap((section, s) =>
          types.includes(section.type)
            ? []
            : [
                {
                  path: ["pages", p, "sections", s, "type"],
                  code: "invalid-answer",
                  message: `There is no block type "${section.type}"`,
                },
              ],
        ),
      );
      if (unknown.length > 0) return { ok: false, issues: unknown };
      // A page of headings, text and buttons only reads as a wall (DESIGN in prompts.ts).
      const plain = parsed.output.pages.flatMap((page, p) =>
        page.sections.every((s) => PLAIN.has(s.type))
          ? [
              {
                path: ["pages", p, "sections"],
                code: "plain-page",
                message:
                  "This page is only headings, text and buttons: group its topics in sections, and use columns, a feature-grid, faq, timeline, callout or gallery where they fit",
              },
            ]
          : [],
      );
      if (plain.length > 0) return { ok: false, issues: plain };
      if (parsed.output.pages[0]?.parentRef !== null) {
        return {
          ok: false,
          issues: [
            { path: ["pages", 0], code: "invalid-answer", message: "The home page has no parent" },
          ],
        };
      }
      return { ok: true, value: parsed.output };
    },
  );
}

// ── 3. A page ────────────────────────────────────────────────────────────────────────────────

export interface WrittenPage {
  ref: string;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  excerpt: string | null;
  blocks: Block[];
  todos: number;
}

export interface PageJob {
  answers: readonly Answered[];
  plan: Plan;
  ref: string;
  catalog: Catalog;
  media: readonly MediaChoice[];
  // The entry id each planned page will have (B5.2: assigned at plan time).
  ids: ReadonlyMap<string, string>;
  makeId: () => string;
  // validateBlockList with the registered rules and the server's HTML cleaner.
  validate: (blocks: Block[]) => BlockListResult;
}

// Text cut at a word boundary to at most `max` characters: an SEO title or description a little
// long isn't worth failing a page over.
export function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : trimmed.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

const PageEnvelope = v.object({
  seoTitle: v.pipe(
    v.string(),
    v.transform((s) => clip(s, 70)),
    v.minLength(1),
  ),
  seoDescription: v.pipe(
    v.string(),
    v.transform((s) => clip(s, 160)),
    v.minLength(1),
  ),
  excerpt: v.nullable(
    v.pipe(
      v.string(),
      v.transform((s) => clip(s, 500)),
    ),
  ),
  blocks: v.array(v.unknown()),
});
type Envelope = v.InferOutput<typeof PageEnvelope>;

type PlannedPage = Plan["pages"][number];
type Section = PlannedPage["sections"][number];

// The provider's refusal of a schema it finds too big to compile (Anthropic's structured output:
// "The compiled grammar is too large"; the spike found it on home pages, which plan the most
// block types). The page is then written a few sections at a time (decisions #133).
export function tooLarge(step: StepResult<unknown>): boolean {
  if (step.ok || step.error?.code !== "bad_request") return false;
  const detail = step.error.detail ?? "";
  return /grammar|schema/i.test(detail) && /large|complex|too many/i.test(detail);
}

// What a section or columns may hold when the page's own block types are too many to offer.
const PLAIN_LEAVES = ["heading", "rich-text", "button", "image"];

// Planned sections in groups of at most three, a section or columns on its own (each holds
// blocks of its own).
function inParts(sections: readonly Section[]): Section[][] {
  const parts: Section[][] = [];
  let current: Section[] = [];
  for (const section of sections) {
    const container = section.type === "section" || section.type === "columns";
    if (current.length > 0 && (container || current.length === 3)) {
      parts.push(current);
      current = [];
    }
    current.push(section);
    if (container) {
      parts.push(current);
      current = [];
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

interface Written {
  envelope: Envelope;
  blocks: Block[];
}

export async function writePage(
  context: DesignContext,
  job: PageJob,
): Promise<StepResult<WrittenPage>> {
  const page = job.plan.pages.find((p) => p.ref === job.ref);
  if (!page) {
    return {
      ok: false,
      issues: [
        { path: ["ref"], code: "unknown-ref", message: `No planned page is called ${job.ref}` },
      ],
      attempts: 0,
      usage: NONE,
    };
  }
  const whole = await writeSections(context, job, page, page.sections, null);
  if (!tooLarge(whole)) return written(page, whole);

  // Too big in one go: a few sections at a time, each checked and repaired on its own, then the
  // whole page checked again (unique ids, limits).
  let usage = whole.usage;
  let attempts = whole.attempts;
  let envelope: Envelope | null = null;
  const blocks: Block[] = [];
  // Still too big, a part is split into single sections; a lone section or columns that's
  // still too big offers only the plainest blocks inside it.
  const parts = inParts(page.sections);
  for (let index = 0; index < parts.length; index++) {
    const sections = parts[index] ?? [];
    const at = { index: index + 1, of: parts.length };
    let part = await writeSections(context, job, page, sections, at);
    if (tooLarge(part) && sections.length > 1) {
      parts.splice(index, 1, ...sections.map((section) => [section]));
      index--;
      usage = addUsage(usage, part.usage);
      continue;
    }
    if (tooLarge(part)) {
      part = await writeSections(context, job, page, sections, at, PLAIN_LEAVES);
    }
    usage = addUsage(usage, part.usage);
    attempts = Math.max(attempts, part.attempts);
    if (!part.ok) return { ...part, usage, attempts };
    envelope ??= part.value.envelope;
    blocks.push(...part.value.blocks);
  }
  const validated = job.validate(blocks);
  if (!validated.ok || !envelope) {
    return { ok: false, issues: validated.ok ? [] : validated.issues, attempts, usage };
  }
  return written(page, {
    ok: true,
    value: { envelope, blocks: validated.value },
    attempts,
    usage,
  });
}

function written(page: PlannedPage, step: StepResult<Written>): StepResult<WrittenPage> {
  if (!step.ok) return step;
  const { envelope, blocks } = step.value;
  return {
    ...step,
    value: {
      ref: page.ref,
      title: page.title,
      slug: page.slug,
      seoTitle: envelope.seoTitle,
      seoDescription: envelope.seoDescription,
      excerpt: envelope.excerpt,
      blocks,
      todos: countTodos([envelope.seoTitle, envelope.seoDescription, envelope.excerpt, blocks]),
    },
  };
}

// Writes some or all of a page's planned sections, with only their block types offered (and a
// heading and text), and checks them: ids, links, the validator, the facts.
function writeSections(
  context: DesignContext,
  job: PageJob,
  page: PlannedPage,
  sections: readonly Section[],
  part: { index: number; of: number } | null,
  // What a section or columns may hold; the page's planned block types without it.
  leaves?: readonly string[],
): Promise<StepResult<Written>> {
  const all = [...job.catalog.blocks, ...job.catalog.templateBlocks];
  const refs = job.plan.pages.map((p) => p.ref);
  // Only the block types the plan named, with a heading and text always there. A section or
  // columns may hold the other leaf types the page plans.
  const containers = sections.some((s) => s.type === "section" || s.type === "columns");
  const only = [
    ...new Set([
      ...sections.map((s) => s.type),
      ...(containers ? (leaves ?? page.sections.map((s) => s.type)) : []),
      "heading",
      "rich-text",
    ]),
  ];
  const schema = pageCatalog(all, { media: job.media, refs, icons: job.catalog.icons }, only);
  const known = knownFacts([context.brief, answersText(job.answers)]);

  const data = fence();
  const mediaList = mediaLines(job.media);
  const others = job.plan.pages.map((p) => `${p.ref}: ${p.title}`).join("\n");
  const planned = (list: readonly Section[]) =>
    list.map((s) => `- ${s.type}: ${s.about}`).join("\n");
  const site = `Site: ${job.plan.siteTitle}${job.plan.tagline ? ` (${job.plan.tagline})` : ""}`;
  const user = [
    data.data("site-description", context.brief, 3000),
    data.data("answers", answersText(job.answers), 6000),
    data.data("site-plan", `${site}\nPages (ref: title):\n${others}`, 4000),
    data.data(
      "page-to-write",
      `ref: ${page.ref}\ntitle: ${page.title}\npurpose: ${page.purpose}\nsections:\n${planned(page.sections)}`,
      3000,
    ),
    part ? data.data("sections-to-write-now", planned(sections), 3000) : "",
    mediaList ? data.data("media-list", mediaList, 6000) : "",
    templateLines(job.catalog, schema.types)
      ? data.data("template-blocks", templateLines(job.catalog, schema.types), 4000)
      : "",
    part
      ? `Write part ${part.index} of ${part.of} of the page with the ref ${page.ref}: only the sections listed in the data block named "sections-to-write-now", in order. The other parts are written separately, so don't repeat them.${part.index === 1 ? "" : " This part doesn't start the page."}`
      : `Write the page with the ref ${page.ref}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return ask(
    context,
    pageSystem(context.language, catalogLines(job.catalog.blocks, schema.types)),
    user,
    { name: "page", schema: pageSchema(schema.list, schema.defs) },
    MAX_TOKENS.page,
    (value) => {
      const envelope = v.safeParse(PageEnvelope, value);
      if (!envelope.success) return { ok: false, issues: valibotIssues(envelope.issues) };
      // Nulls out, fresh ids (B6: the model's are never kept), refs to the planned entry ids.
      const blocks = withBlockIds(
        withoutIds(withoutNulls(envelope.output.blocks)) as StarterBlock[],
        job.makeId,
      );
      const resolved = resolveRefs(blocks, job.ids, ["blocks"]);
      const validated = job.validate(resolved.value);
      const issues: ContentIssue[] = [...resolved.issues];
      if (!validated.ok) {
        issues.push(...validated.issues.map((i) => ({ ...i, path: ["blocks", ...i.path] })));
      }
      issues.push(...inventedFacts(envelope.output, known));
      issues.push(...designIssues(withoutNulls(envelope.output.blocks) as unknown[]));
      if (issues.length > 0 || !validated.ok) return { ok: false, issues };
      return { ok: true, value: { envelope: envelope.output, blocks: validated.value } };
    },
  );
}
