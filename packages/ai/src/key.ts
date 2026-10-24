// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { SealedSecret } from "@sitebuilder/schema";

// The AI provider's key, encrypted before it reaches the database (templates_and_ai_design B3).
// AES-256-GCM under a key derived from AUTH_SECRET, as the S3 secret is (decisions #46), with
// its own label, so the two derived keys differ, and the settings row's name as associated
// data, so a cipher pasted into another row doesn't open. If AUTH_SECRET changes, the key has to
// be entered again.

const INFO = "sitebuilder:ai-key:v1";
const AAD = Buffer.from("settings:ai");

const keyFrom = (authSecret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, "", INFO, 32));

export function sealKey(plain: string, authSecret: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  };
}

// null when the key was sealed under another AUTH_SECRET or for another row, or was changed.
export function openKey(sealed: SealedSecret, authSecret: string): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(authSecret),
      Buffer.from(sealed.iv, "base64url"),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// What the Settings screen shows of a key: its last four characters.
export const lastFour = (key: string): string => key.slice(-4);
