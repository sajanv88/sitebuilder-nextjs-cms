// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { AiErrorCode } from "./types";

// What a person is told for each error code (templates_and_ai_design B2).
export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  disabled: "AI isn't set up. Ask an admin to set it up in Settings, AI.",
  auth: "The provider rejected the key. Check it in Settings, AI.",
  rate_limited: "The provider is busy. Try again shortly.",
  quota: "The provider says the account is out of credit.",
  timeout: "The provider took too long to answer.",
  unavailable: "The provider can't be reached, or is having problems.",
  invalid_output: "The answer wasn't usable. Try again, or change what you asked for.",
  refused: "The provider declined this request.",
  too_large: "This is too large to send to the provider.",
  blocked_url:
    "That address isn't allowed. An address on this machine or your network needs AI_ALLOW_PRIVATE_URLS=true on the server, and one on the internet needs https.",
  limit: "The AI limit has been reached for now.",
  model: "The provider doesn't have that model, or this key can't use it.",
  bad_request: "The provider couldn't use this request.",
  cancelled: "Stopped.",
};

// A provider's own words, with the key taken out and cut to a sensible length.
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[key]");
  }
  // Anything that looks like a key, in case the provider echoes a different one.
  out = out.replace(/\b(sk|sk-ant|sk-proj|key)[-_][A-Za-z0-9_-]{12,}/g, "[key]");
  return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}
