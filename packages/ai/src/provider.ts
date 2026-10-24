// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import type { AiConnection, AiError, AiProvider, FetchLike } from "./types";

// One adapter per provider, behind the same interface. Amazon Bedrock and Azure AI Foundry
// will be more cases here.
export function createProvider(connection: AiConnection, fetch: FetchLike): AiProvider {
  switch (connection.provider) {
    case "anthropic":
      return anthropicProvider(connection.key, fetch);
    case "openai":
      return openaiProvider(connection.key, fetch);
    case "ollama":
      return ollamaProvider(connection.baseUrl, connection.key, fetch);
  }
}

export interface RetryOptions {
  // Waits between attempts; tests pass one that doesn't.
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

// How long to wait before the next attempt, or null for no more (B2): a rate limit twice,
// honouring Retry-After; an outage twice, backing off; a timeout once.
function nextDelay(error: AiError, attempt: number): number | null {
  if (error.code === "rate_limited" && attempt < 2)
    return error.retryAfterMs ?? 2000 * 2 ** attempt;
  if (error.code === "unavailable" && attempt < 2) return 1000 * 3 ** attempt;
  if (error.code === "timeout" && attempt < 1) return 0;
  return null;
}

// Retries generate() as B2 says. listModels() isn't retried: it answers a person waiting on
// the Settings screen, who can press the button again.
export function withRetries(provider: AiProvider, { sleep = wait }: RetryOptions = {}): AiProvider {
  return {
    name: provider.name,
    listModels: (signal) => provider.listModels(signal),
    async generate(request) {
      for (let attempt = 0; ; attempt++) {
        const result = await provider.generate(request);
        if (result.ok || request.signal?.aborted) return result;
        const delay = nextDelay(result.error, attempt);
        if (delay === null) return result;
        await sleep(delay, request.signal);
        if (request.signal?.aborted) return { ok: false, error: { code: "cancelled" } };
      }
    },
  };
}
