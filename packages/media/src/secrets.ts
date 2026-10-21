import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { SealedSecret } from "@sitebuilder/schema";

// The S3 secret key an admin saves in Settings, encrypted before it reaches the database
// (decisions #46). AES-256-GCM, with a key derived from AUTH_SECRET, so no second secret has to
// be managed. If AUTH_SECRET changes, a sealed value can't be opened and has to be entered again.

const INFO = "sitebuilder:settings-secret:v1";

const keyFrom = (authSecret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", authSecret, "", INFO, 32));

export function sealSecret(plain: string, authSecret: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  };
}

// null when the value was sealed under another AUTH_SECRET, or was changed.
export function openSecret(sealed: SealedSecret, authSecret: string): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(authSecret),
      Buffer.from(sealed.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
