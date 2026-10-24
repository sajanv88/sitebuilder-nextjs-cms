// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { redact } from "./errors";
import { OutboundError } from "./outbound-error";
import type { AiError, AiErrorCode, AiResult, FetchInit, FetchLike } from "./types";

// What the adapters share: sending a request, reading the answer as JSON, and turning a failed
// one into an error code.

export interface Reply {
  status: number;
  headers: Headers;
  // Parsed JSON, or the text when it isn't JSON.
  body: unknown;
}

// Sends the request. A network failure, a timeout or the guard's refusal comes back as an
// error; any HTTP answer, failed or not, comes back as a Reply for the adapter to read.
export async function send(
  fetch: FetchLike,
  url: string,
  init: FetchInit,
  secrets: readonly (string | undefined)[],
): Promise<AiResult<Reply>> {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      // Not JSON: keep the text.
    }
    return { ok: true, value: { status: response.status, headers: response.headers, body } };
  } catch (error) {
    if (init.signal?.aborted) return fail("cancelled");
    if (error instanceof OutboundError) {
      return fail(error.code, redact(error.message, secrets));
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail("unavailable", redact(message, secrets));
  }
}

export const fail = <T>(
  code: AiErrorCode,
  detail?: string,
  retryAfterMs?: number,
): AiResult<T> => ({
  ok: false,
  error: {
    code,
    ...(detail ? { detail } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  },
});

// Retry-After in seconds or as an HTTP date; capped, so a provider can't park a request.
export function retryAfter(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 60_000) : undefined;
}

// The code for a failed answer from its status alone; each adapter refines it from the body.
export function codeForStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 404) return "model";
  if (status === 408) return "timeout";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_request";
}

export function errorFor(
  reply: Reply,
  code: AiErrorCode,
  message: string | undefined,
  secrets: readonly (string | undefined)[],
): AiError {
  const after = code === "rate_limited" ? retryAfter(reply.headers) : undefined;
  return {
    code,
    detail: redact(message ?? `HTTP ${reply.status}`, secrets),
    ...(after !== undefined ? { retryAfterMs: after } : {}),
  };
}

// A field of a JSON object, or undefined.
export function field(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

// The model's answer as JSON. Some local models wrap it in a Markdown code fence anyway.
export function parseAnswer(answer: string): AiResult<unknown> {
  const trimmed = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return fail("invalid_output", "The answer wasn't JSON.");
  }
}
