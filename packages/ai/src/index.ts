// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";

// The AI assistant's provider layer (templates_and_ai_design B1, B2): one interface, an adapter
// per provider, the error codes, the outbound guard and the key's sealing. No Next.js and no
// database here: the admin passes the settings and the guard in.

export { AI_ERROR_MESSAGES, redact } from "./errors";
export { lastFour, openKey, sealKey } from "./key";
export { type AddressKind, classifyAddress, guardedFetch, type OutboundOptions } from "./outbound";
export { OutboundError } from "./outbound-error";
export { createProvider, type RetryOptions, withRetries } from "./provider";
export type {
  AiConnection,
  AiError,
  AiErrorCode,
  AiImage,
  AiMessage,
  AiModel,
  AiProvider,
  AiResult,
  FetchInit,
  FetchLike,
  Generated,
  GenerateRequest,
  OutputSchema,
  Usage,
} from "./types";
export { type AiSettingsView, aiSettingsView, DEFAULT_OLLAMA_URL } from "./view";
