// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { NodeId, SealedSecret, Uuid } from "./shared";

// The AI assistant's settings (design §15, templates_and_ai_design B3). An admin picks a
// provider and brings their own key. The settings are a union by provider, so each provider has
// only the fields it needs; Amazon Bedrock and Azure AI Foundry will be more cases. No `ai` row
// means the assistant is off.

export const AI_PROVIDERS = ["anthropic", "openai", "ollama"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

// What providers call their models: "claude-sonnet-5-5", "gpt-5", "llama3.2:3b",
// "hf.co/org/model:Q4_K_M".
export const AiModelName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Choose a model"),
  v.maxLength(200, "Use at most 200 characters"),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/, "That isn't a model name"),
);

// An Ollama server: http or https, a host and port, and a path only when a proxy puts it under
// one. Where it may point (this machine, the network) is the outbound guard's call at request
// time (packages/ai), not the schema's.
export const AiBaseUrl = v.pipe(
  v.string(),
  v.trim(),
  v.url("Enter the server's address, such as http://localhost:11434"),
  v.check((s) => /^https?:\/\//.test(s), "The address must start with https:// or http://"),
  v.check(
    (s) => /^https?:\/\/[^/?#@\s]+(\/[^?#@\s]*)?$/.test(s),
    "Enter only the server's address, without a user name, query or #",
  ),
  v.transform((s) => s.replace(/\/+$/, "")),
);

// API keys are printable ASCII without spaces.
export const AiKeyInput = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[!-~]{8,512}$/, "Enter the API key"),
);

export const DEFAULT_DAILY_TOKEN_LIMIT = 1_000_000;
export const DailyTokenLimit = v.pipe(
  v.number("Enter a number"),
  v.integer("Enter a whole number"),
  v.minValue(10_000, "Allow at least 10,000"),
  v.maxValue(100_000_000, "Allow at most 100,000,000"),
);

// What every provider has: the model, the site's daily token limit (B9), and whether the model
// takes images, which an admin says (B2: never guessed from the model's name).
const chosen = {
  model: AiModelName,
  dailyTokenLimit: DailyTokenLimit,
  supportsImages: v.boolean(),
};

// The key as stored: sealed (packages/ai, key.ts), with its last four characters to show.
const keyLast4 = v.pipe(v.string(), v.maxLength(4));

export const AiSettings = v.variant("provider", [
  v.object({ provider: v.literal("anthropic"), ...chosen, key: SealedSecret, keyLast4 }),
  v.object({ provider: v.literal("openai"), ...chosen, key: SealedSecret, keyLast4 }),
  // A key only when the server asks for one: Ollama's cloud does, a server of your own
  // usually doesn't.
  v.object({
    provider: v.literal("ollama"),
    ...chosen,
    baseUrl: AiBaseUrl,
    key: v.optional(SealedSecret),
    keyLast4: v.optional(keyLast4),
  }),
]);
export type AiSettings = v.InferOutput<typeof AiSettings>;

// ── What the Settings form sends ─────────────────────────────────────────────────────────────
// The key is plain text here, and optional: left empty, the saved one is kept, if it was saved
// for the same provider (and for Ollama, the same address, so a key never goes to a server it
// wasn't typed for).

const typedKey = { key: v.optional(AiKeyInput) };

// Enough to reach the provider and list its models: what "Connect" sends.
export const AiConnectionInput = v.variant("provider", [
  v.object({ provider: v.literal("anthropic"), ...typedKey }),
  v.object({ provider: v.literal("openai"), ...typedKey }),
  v.object({ provider: v.literal("ollama"), baseUrl: AiBaseUrl, ...typedKey }),
]);
export type AiConnectionInput = v.InferOutput<typeof AiConnectionInput>;

// What "Save" sends. "off" removes the settings, and with them the key.
export const AiSettingsInput = v.variant("provider", [
  v.object({ provider: v.literal("off") }),
  v.object({ provider: v.literal("anthropic"), ...typedKey, ...chosen }),
  v.object({ provider: v.literal("openai"), ...typedKey, ...chosen }),
  v.object({ provider: v.literal("ollama"), baseUrl: AiBaseUrl, ...typedKey, ...chosen }),
]);
export type AiSettingsInput = v.InferOutput<typeof AiSettingsInput>;

// ── Designing a site with the assistant ──────────────────────────────────────────────────────
// The admin describes the site, the model asks a few questions, the admin answers, the model
// plans the pages, then writes each one (phase 8 plan, 8.0). The model's answers are checked
// against these before anything is used.

export const MAX_QUESTIONS = 6;
export const MAX_PLANNED_PAGES = 12;

// The admin's own words: the description and each answer.
export const AiBrief = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(20, "Describe the site in a sentence or two"),
  v.maxLength(3000, "Use at most 3,000 characters"),
);
export const AiAnswerText = v.pipe(v.string(), v.trim(), v.maxLength(600));

const short = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

// What a question may not ask for: the assistant only needs to know about the website.
const FORBIDDEN_TOPIC =
  /\b(password|passcode|pin code|credit card|card number|cvv|cvc|iban|bank account|sort code|social security|passport|national id|tax id|api key|secret key|access token|login|log-in)\b/i;

export const AiQuestion = v.object({
  id: v.pipe(v.string(), v.regex(/^q[1-9]$/)),
  question: v.pipe(
    short(200),
    v.check((s) => !FORBIDDEN_TOPIC.test(s), "A question may only ask about the website"),
  ),
  kind: v.picklist(["single", "multiple", "text"]),
  // Six at most; a seventh the model adds is dropped rather than failing the questions.
  options: v.pipe(
    v.array(short(120)),
    v.transform((options) => options.slice(0, 6)),
  ),
});
export type AiQuestion = v.InferOutput<typeof AiQuestion>;

export const AiInterview = v.pipe(
  v.object({
    summary: short(400),
    questions: v.pipe(v.array(AiQuestion), v.maxLength(MAX_QUESTIONS)),
  }),
  v.check(
    ({ questions }) => new Set(questions.map((q) => q.id)).size === questions.length,
    "Each question needs an id of its own",
  ),
  v.check(
    ({ questions }) =>
      questions.every((q) => (q.kind === "text" ? q.options.length === 0 : q.options.length >= 2)),
    "A choice question needs two to six options, and a text question none",
  ),
);
export type AiInterview = v.InferOutput<typeof AiInterview>;

export const AiAnswer = v.object({
  id: v.pipe(v.string(), v.regex(/^q[1-9]$/)),
  answer: v.union([AiAnswerText, v.pipe(v.array(AiAnswerText), v.maxLength(6))]),
});
export type AiAnswer = v.InferOutput<typeof AiAnswer>;

const PlanRef = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,39}$/));

export const SitePlanPage = v.object({
  ref: PlanRef,
  title: short(120),
  slug: v.pipe(v.string(), v.maxLength(80), v.regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)),
  parentRef: v.nullable(PlanRef),
  purpose: short(400),
  // The parts of the page in order: a block type each, and what it holds. The page is then
  // written with only these block types offered (the spike: one schema with every block type
  // is more than Anthropic's structured output compiles).
  sections: v.pipe(
    v.array(
      v.object({ type: v.pipe(v.string(), v.minLength(1), v.maxLength(80)), about: short(300) }),
    ),
    v.minLength(1),
    v.maxLength(12),
  ),
});
export type SitePlanPage = v.InferOutput<typeof SitePlanPage>;

// The planned site. The first page is the home page. Every ref is unique; a parent is another
// page, planned before its children, and no page is its own ancestor; menus name planned pages.
export const SitePlan = v.pipe(
  v.object({
    siteTitle: short(120),
    tagline: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    pages: v.pipe(v.array(SitePlanPage), v.minLength(1), v.maxLength(MAX_PLANNED_PAGES)),
    primaryMenu: v.pipe(v.array(PlanRef), v.maxLength(12)),
    footerMenu: v.pipe(v.array(PlanRef), v.maxLength(12)),
  }),
  v.check(
    ({ pages }) => new Set(pages.map((p) => p.ref)).size === pages.length,
    "Each page needs a ref of its own",
  ),
  v.check(({ pages }) => {
    const slugs = pages.map((p) => `${p.parentRef ?? ""}/${p.slug}`);
    return new Set(slugs).size === slugs.length;
  }, "Two pages under the same parent have the same address"),
  v.check(({ pages }) => {
    const before = new Set<string>();
    for (const page of pages) {
      if (page.parentRef !== null && !before.has(page.parentRef)) return false;
      before.add(page.ref);
    }
    return true;
  }, "A page's parent must be planned before it"),
  v.check(({ pages, primaryMenu, footerMenu }) => {
    const refs = new Set(pages.map((p) => p.ref));
    return [...primaryMenu, ...footerMenu].every((ref) => refs.has(ref));
  }, "A menu names a page that isn't planned"),
);
export type SitePlan = v.InferOutput<typeof SitePlan>;

// ── What the "Create with AI" screen sends (/admin/api/ai/*) ─────────────────────────────────
// The client holds the description, the answers and the plan, and sends them with each call;
// the server checks them again every time (B5.2), so a changed plan can't do more than an admin
// could.

export const AiAnswered = v.object({
  question: short(200),
  answer: v.union([AiAnswerText, v.pipe(v.array(AiAnswerText), v.maxLength(6))]),
});
export type AiAnswered = v.InferOutput<typeof AiAnswered>;

const Answers = v.pipe(v.array(AiAnswered), v.maxLength(MAX_QUESTIONS));

export const AiQuestionsRequest = v.object({ brief: AiBrief });

export const AiPlanRequest = v.object({ brief: AiBrief, answers: Answers });

// The entry id each planned page gets (B5.2: chosen when the plan is made), by ref: one for
// every page in the plan, each different.
const EntryIds = v.record(PlanRef, Uuid);
const idsMatchPlan = (plan: SitePlan, ids: Record<string, string>) => {
  const refs = plan.pages.map((p) => p.ref).sort();
  const keys = Object.keys(ids).sort();
  return (
    refs.length === keys.length &&
    refs.every((ref, i) => ref === keys[i]) &&
    new Set(Object.values(ids)).size === keys.length
  );
};

export const AiPageRequest = v.pipe(
  v.object({
    batchId: Uuid,
    brief: AiBrief,
    answers: Answers,
    plan: SitePlan,
    ids: EntryIds,
    ref: PlanRef,
  }),
  v.check(({ plan, ids }) => idsMatchPlan(plan, ids), "Every planned page needs its own id"),
  v.check(({ plan, ref }) => plan.pages.some((p) => p.ref === ref), "That page isn't planned"),
);
export type AiPageRequest = v.InferOutput<typeof AiPageRequest>;

export const AiFinishRequest = v.pipe(
  v.object({
    batchId: Uuid,
    plan: SitePlan,
    ids: EntryIds,
    // What to apply, each ticked by the admin.
    menus: v.boolean(),
    homepage: v.boolean(),
    siteTitle: v.boolean(),
  }),
  v.check(({ plan, ids }) => idsMatchPlan(plan, ids), "Every planned page needs its own id"),
);
export type AiFinishRequest = v.InferOutput<typeof AiFinishRequest>;

export const AiDiscardRequest = v.object({ batchId: Uuid, includeEdited: v.boolean() });

// ── Help on a page (8.7) ─────────────────────────────────────────────────────────────────────
// What the editor sends: the entry ("" for one not saved yet, with its type), its title and its
// blocks as they are in the editor (checked with validateContent on the server, like a save).

export const HELP_INSTRUCTION_MAX = 1000;

const HelpEntry = {
  entryId: v.union([v.literal(""), Uuid]),
  type: v.picklist(["page", "post"]),
  title: v.pipe(v.string(), v.maxLength(200)),
  content: v.pipe(v.array(v.unknown()), v.maxLength(500)),
};

export const AiHelpRequest = v.variant("kind", [
  // Rewrite the block with this id (a column's columns), or every block when it's absent.
  v.object({
    kind: v.literal("rewrite"),
    ...HelpEntry,
    blockId: v.optional(NodeId),
    instruction: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, "Say what to change"),
      v.maxLength(HELP_INSTRUCTION_MAX, `Use at most ${HELP_INSTRUCTION_MAX} characters`),
    ),
  }),
  v.object({ kind: v.literal("seo"), ...HelpEntry }),
  // The picture must be one the blocks use; `max` is the alt field's limit.
  v.object({
    kind: v.literal("alt"),
    ...HelpEntry,
    mediaId: Uuid,
    max: v.pipe(v.number(), v.integer(), v.minValue(20), v.maxValue(1000)),
  }),
]);
export type AiHelpRequest = v.InferOutput<typeof AiHelpRequest>;
