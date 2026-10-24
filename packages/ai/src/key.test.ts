// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lastFour, openKey, sealKey } from "./key";
import { aiSettingsView } from "./view";

const SECRET = "a".repeat(40);

// Sealed as packages/media seals the S3 secret: its own label, no associated data.
function sealAsS3Secret(plain: string, authSecret: string) {
  const key = Buffer.from(hkdfSync("sha256", authSecret, "", "sitebuilder:settings-secret:v1", 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  };
}
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-1234";

describe("the AI key", () => {
  it("opens with the same AUTH_SECRET", () => {
    expect(openKey(sealKey(KEY, SECRET), SECRET)).toBe(KEY);
  });

  it("is sealed afresh each time", () => {
    expect(sealKey(KEY, SECRET).iv).not.toBe(sealKey(KEY, SECRET).iv);
  });

  it("doesn't open under another AUTH_SECRET", () => {
    expect(openKey(sealKey(KEY, SECRET), "b".repeat(40))).toBeNull();
  });

  it("doesn't open once changed", () => {
    const sealed = sealKey(KEY, SECRET);
    const data = Buffer.from(sealed.data, "base64url");
    data[0] = (data[0] ?? 0) ^ 1;
    expect(openKey({ ...sealed, data: data.toString("base64url") }, SECRET)).toBeNull();
    expect(openKey({ ...sealed, tag: sealKey(KEY, SECRET).tag }, SECRET)).toBeNull();
  });

  it("can't be swapped with the S3 secret: each opens only where it was sealed", () => {
    const s3 = sealAsS3Secret(KEY, SECRET);
    expect(openKey(s3, SECRET)).toBeNull();
  });

  it("shows its last four characters", () => {
    expect(lastFour(KEY)).toBe("1234");
  });
});

describe("what the Settings screen receives", () => {
  it("has no cipher in it, anywhere", () => {
    const key = sealKey(KEY, SECRET);
    const views = [
      aiSettingsView(
        {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          dailyTokenLimit: 1_000_000,
          supportsImages: true,
          key,
          keyLast4: lastFour(KEY),
        },
        SECRET,
      ),
      aiSettingsView(
        {
          provider: "ollama",
          model: "llama3.2",
          baseUrl: "https://ollama.com",
          dailyTokenLimit: 1_000_000,
          supportsImages: false,
          key,
          keyLast4: lastFour(KEY),
        },
        SECRET,
      ),
      aiSettingsView(undefined, SECRET),
    ];
    for (const view of views) {
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain(key.data);
      expect(serialised).not.toContain(key.iv);
      expect(serialised).not.toContain(key.tag);
      expect(serialised).not.toContain(KEY);
    }
    expect(views[0]).toMatchObject({ provider: "anthropic", key: "saved", keyLast4: "1234" });
  });

  it("says when the saved key can't be opened any more", () => {
    const view = aiSettingsView(
      {
        provider: "openai",
        model: "gpt-5",
        dailyTokenLimit: 1_000_000,
        supportsImages: false,
        key: sealKey(KEY, SECRET),
        keyLast4: "1234",
      },
      "c".repeat(40),
    );
    expect(view).toMatchObject({ key: "unreadable", keyLast4: "" });
  });

  it("is off without settings", () => {
    expect(aiSettingsView(undefined, SECRET)).toMatchObject({ provider: "off", key: "none" });
  });
});
