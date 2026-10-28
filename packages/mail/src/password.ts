// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { SealedSecret } from "@sitebuilder/schema";

// The SMTP password an admin saves in Settings → Email, sealed before it reaches the database:
// AES-256-GCM under a key derived from AUTH_SECRET with a label of its own, and the settings
// row's name as associated data, so a sealed value pasted into another row doesn't open. If
// AUTH_SECRET changes, it can't be opened and has to be entered again.

const INFO = "sitebuilder:smtp-password:v1";
const ROW = Buffer.from("settings:email");

const keyFrom = (authSecret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, "", INFO, 32));

export function sealPassword(plain: string, authSecret: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), iv);
  cipher.setAAD(ROW);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  };
}

// null when it was sealed under another AUTH_SECRET, for another row, or was changed.
export function openPassword(sealed: SealedSecret, authSecret: string): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(authSecret),
      Buffer.from(sealed.iv, "base64url"),
    );
    decipher.setAAD(ROW);
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
