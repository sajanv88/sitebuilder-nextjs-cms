// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { Email } from "./accounts";
import { SealedSecret } from "./shared";

// Sending email through SMTP (decisions #147): password reset links and invitations. An admin
// sets a server in Settings → Email, its password sealed like the S3 key; without one, the
// SMTP_* environment variables are used; without those, nothing is sent and the screens that
// need email say so.

// tls: TLS from the start (port 465). starttls: plain, then upgraded, which must succeed (587).
// none: no encryption, for a relay on the same machine or network only.
export const EMAIL_SECURITY = ["tls", "starttls", "none"] as const;
export type EmailSecurity = (typeof EMAIL_SECURITY)[number];

// A host name or an address. Never link-local or a cloud's metadata address: the server
// connects to it.
const HOST =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$|^\[[0-9a-f:.]+\]$/i;
const BLOCKED = /^(169\.254\.|\[fe80:|metadata\.google\.internal$)/i;

export const SmtpHost = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(HOST, "Enter the server's name, such as smtp.example.com"),
  v.check((s) => !BLOCKED.test(s), "That address can't be used"),
);

export const SmtpPort = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535));

const FromName = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(80, "Use at most 80 characters"),
  // It goes into a header.
  v.check((s) => !/[\r\n<>"]/.test(s), "Leave out line breaks, quotes and angle brackets"),
);

export const EmailSettings = v.object({
  host: SmtpHost,
  port: SmtpPort,
  security: v.picklist(EMAIL_SECURITY),
  username: v.nullable(v.pipe(v.string(), v.maxLength(320))),
  password: v.nullable(SealedSecret),
  fromName: FromName,
  fromAddress: Email,
});
export type EmailSettings = v.InferOutput<typeof EmailSettings>;

// What the Settings form sends. "environment" removes the saved server. A password left
// blank keeps the saved one.
export const EmailInput = v.variant("source", [
  v.object({ source: v.literal("environment") }),
  v.object({
    source: v.literal("smtp"),
    host: SmtpHost,
    port: v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^\d{1,5}$/, "Enter a port number, such as 587"),
      v.toNumber(),
      v.minValue(1, "Enter a port number, such as 587"),
      v.maxValue(65535, "Enter a port number, such as 587"),
    ),
    security: v.picklist(EMAIL_SECURITY),
    username: v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(320, "Use at most 320 characters"),
      v.transform((s) => (s === "" ? null : s)),
    ),
    password: v.pipe(v.string(), v.maxLength(1000)),
    fromName: FromName,
    fromAddress: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email("Enter an email address")),
  }),
]);
export type EmailInput = v.InferOutput<typeof EmailInput>;

// "Site <site@example.com>" or a bare address, as SMTP_FROM holds it.
export function parseFrom(text: string): { name: string; address: string } | null {
  const match = /^\s*(?:"?([^"<>\r\n]*?)"?\s*<([^<>\s]+)>|([^<>\s]+))\s*$/.exec(text);
  const address = (match?.[2] ?? match?.[3] ?? "").toLowerCase();
  if (!v.is(Email, address)) return null;
  return { name: (match?.[1] ?? "").trim(), address };
}
