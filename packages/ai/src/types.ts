// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { AiProviderName } from "@sitebuilder/schema";

// What the rest of the app sees of a provider (design §15, templates_and_ai_design B2). Every
// provider is behind the same interface, and every failure is a value with one of the codes
// below, never an exception.

export type AiErrorCode =
  // No settings, or a key that can't be opened any more.
  | "disabled"
  | "auth"
  | "rate_limited"
  | "quota"
  | "timeout"
  | "unavailable"
  // The answer wasn't JSON, was cut off, or (later) failed validation after a repair.
  | "invalid_output"
  | "refused"
  | "too_large"
  | "blocked_url"
  // Our own limits (B9).
  | "limit"
  // The provider doesn't have the model, or this key can't use it.
  | "model"
  // The provider turned the request down for another reason; `detail` says why.
  | "bad_request"
  // The caller aborted.
  | "cancelled";

export interface AiError {
  code: AiErrorCode;
  // What the provider said, with the key taken out, for logs and for an admin testing the
  // connection. Never shown to editors.
  detail?: string;
  // From Retry-After, for a rate limit.
  retryAfterMs?: number;
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiError };

// The one way out of the server to a provider: the outbound guard (outbound.ts) in the app, a
// fake in tests.
export interface FetchInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}
export type FetchLike = (url: string, init?: FetchInit) => Promise<Response>;

// Where to reach a provider and with what key. Opened from the settings on the server only.
export type AiConnection =
  | { provider: "anthropic"; key: string }
  | { provider: "openai"; key: string }
  | { provider: "ollama"; baseUrl: string; key?: string };

export interface AiModel {
  id: string;
  // What the provider calls it, when that differs from the id.
  label: string;
}

// A picture sent with a message, for a model that takes images (alt text, 8.7).
export interface AiImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  // Base64, without a data: prefix.
  data: string;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  // Before the text. Only on a user message, and only for a model that takes images.
  images?: readonly AiImage[];
}

// The JSON Schema the answer must follow.
export interface OutputSchema {
  name: string;
  schema: Record<string, unknown>;
  // OpenAI's strict mode, for a schema that meets its rules (every property required, no
  // additional properties).
  strict?: boolean;
}

export interface GenerateRequest {
  model: string;
  // The stable part first (B6): providers that cache prompts cache this.
  system: string;
  messages: AiMessage[];
  output: OutputSchema;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Generated {
  // The parsed JSON. Whoever asked validates it.
  value: unknown;
  usage: Usage;
  model: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  listModels(signal?: AbortSignal): Promise<AiResult<AiModel[]>>;
  generate(request: GenerateRequest): Promise<AiResult<Generated>>;
}
