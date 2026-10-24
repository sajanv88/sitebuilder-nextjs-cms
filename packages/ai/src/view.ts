// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  type AiProviderName,
  type AiSettings,
  DEFAULT_DAILY_TOKEN_LIMIT,
} from "@sitebuilder/schema";
import { openKey } from "./key";

// What the Settings screen receives of the AI settings (B3): never the cipher, only whether a
// key is saved, whether it still opens, and its last four characters.

export interface AiSettingsView {
  provider: AiProviderName | "off";
  model: string;
  baseUrl: string;
  key: "none" | "saved" | "unreadable";
  keyLast4: string;
  dailyTokenLimit: number;
  supportsImages: boolean;
}

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export function aiSettingsView(saved: AiSettings | undefined, authSecret: string): AiSettingsView {
  if (!saved) {
    return {
      provider: "off",
      model: "",
      baseUrl: DEFAULT_OLLAMA_URL,
      key: "none",
      keyLast4: "",
      dailyTokenLimit: DEFAULT_DAILY_TOKEN_LIMIT,
      supportsImages: false,
    };
  }
  const key = saved.key
    ? openKey(saved.key, authSecret) === null
      ? "unreadable"
      : "saved"
    : "none";
  return {
    provider: saved.provider,
    model: saved.model,
    baseUrl: saved.provider === "ollama" ? saved.baseUrl : DEFAULT_OLLAMA_URL,
    key,
    keyLast4: key === "saved" ? (saved.keyLast4 ?? "") : "",
    dailyTokenLimit: saved.dailyTokenLimit,
    supportsImages: saved.supportsImages,
  };
}
