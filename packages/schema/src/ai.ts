// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { SealedSecret } from "./shared";

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
