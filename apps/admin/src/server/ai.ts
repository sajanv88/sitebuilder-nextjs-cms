// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import {
  type AiConnection,
  type AiProvider,
  createProvider,
  guardedFetch,
  openKey,
  withRetries,
} from "@sitebuilder/ai";
import type { AiSettings } from "@sitebuilder/schema";
import { env } from "@/env";

// The AI provider for the saved settings, reached only through the outbound guard. The key is
// opened here and goes no further than the adapter's request headers.

export function outbound() {
  return guardedFetch({ allowPrivate: env().AI_ALLOW_PRIVATE_URLS });
}

// The connection the saved settings describe, or null when their key can't be opened (the
// server's AUTH_SECRET changed).
export function savedConnection(saved: AiSettings): AiConnection | null {
  const key = saved.key ? openKey(saved.key, env().AUTH_SECRET) : undefined;
  if (key === null) return null;
  switch (saved.provider) {
    case "anthropic":
    case "openai":
      return key ? { provider: saved.provider, key } : null;
    case "ollama":
      return { provider: "ollama", baseUrl: saved.baseUrl, ...(key ? { key } : {}) };
  }
}

export function aiProvider(connection: AiConnection): AiProvider {
  return withRetries(createProvider(connection, outbound()));
}
