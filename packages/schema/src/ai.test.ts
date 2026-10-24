// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { AiBaseUrl, AiModelName, AiSettings, AiSettingsInput } from "./ai";

const sealed = { iv: "aaaa", tag: "bbbb", data: "cccc" };

describe("AI settings", () => {
  it.each([
    ["http://localhost:11434", "http://localhost:11434"],
    ["https://ollama.com/", "https://ollama.com"],
    ["https://gpu.example.com:8443/ollama/", "https://gpu.example.com:8443/ollama"],
  ])("takes the Ollama address %s", (input, output) => {
    expect(v.parse(AiBaseUrl, input)).toBe(output);
  });

  it.each([
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com/?x=1",
    "https://example.com/#x",
    "localhost:11434",
  ])("refuses the Ollama address %s", (input) => {
    expect(v.is(AiBaseUrl, input)).toBe(false);
  });

  it.each(["claude-sonnet-5-5", "gpt-5", "llama3.2:3b", "hf.co/org/model:Q4_K_M"])(
    "takes the model name %s",
    (name) => {
      expect(v.is(AiModelName, name)).toBe(true);
    },
  );

  it.each(["", " ", "a b", "<script>"])("refuses the model name %j", (name) => {
    expect(v.is(AiModelName, name)).toBe(false);
  });

  it("stores a key for Anthropic and OpenAI, and for Ollama only when there is one", () => {
    const shared = { model: "m", dailyTokenLimit: 1_000_000, supportsImages: false };
    expect(
      v.is(AiSettings, { provider: "anthropic", ...shared, key: sealed, keyLast4: "abcd" }),
    ).toBe(true);
    expect(v.is(AiSettings, { provider: "openai", ...shared })).toBe(false);
    expect(
      v.is(AiSettings, { provider: "ollama", ...shared, baseUrl: "http://localhost:11434" }),
    ).toBe(true);
  });

  it("lets the form turn the assistant off, or leave the key empty to keep the saved one", () => {
    expect(v.is(AiSettingsInput, { provider: "off" })).toBe(true);
    expect(
      v.is(AiSettingsInput, {
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        dailyTokenLimit: 500_000,
        supportsImages: true,
      }),
    ).toBe(true);
  });

  it("keeps the daily limit within bounds", () => {
    const input = { provider: "openai", model: "gpt-5", supportsImages: false };
    expect(v.is(AiSettingsInput, { ...input, dailyTokenLimit: 5_000 })).toBe(false);
    expect(v.is(AiSettingsInput, { ...input, dailyTokenLimit: 1.5 })).toBe(false);
    expect(v.is(AiSettingsInput, { ...input, dailyTokenLimit: 200_000_000 })).toBe(false);
  });
});
