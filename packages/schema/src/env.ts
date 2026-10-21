// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";

// Runtime configuration (design §9), the same for both zones. Parsed once at server start; the
// app refuses to start with a message naming each bad variable. Values are never echoed, since
// several are secrets.

const httpUrl = v.pipe(
  v.string(),
  v.url(),
  v.check((s) => /^https?:\/\//.test(s), "Must start with http:// or https://"),
);

const required = v.pipe(v.string(), v.minLength(1, "Is required"));

const base = {
  DATABASE_URL: v.pipe(
    v.string(),
    v.check((s) => /^postgres(ql)?:\/\/\S+$/.test(s), "Must be a postgres:// URL"),
  ),
  AUTH_SECRET: v.pipe(v.string(), v.minLength(32, "Must be at least 32 characters")),
  SITE_URL: httpUrl,
  MEDIA_MAX_BYTES: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+$/, "Must be a whole number of bytes"),
      v.toNumber(),
      v.minValue(1),
    ),
    String(25 * 1024 * 1024),
  ),
  CRON_SECRET: v.optional(v.pipe(v.string(), v.minLength(32, "Must be at least 32 characters"))),
  // Where local storage keeps files. Read with S3 too: files uploaded before a switch to S3
  // stay on disk (decisions #48).
  MEDIA_LOCAL_DIR: v.optional(v.pipe(v.string(), v.minLength(1)), "/data/media"),
};

export const EnvSchema = v.variant(
  "MEDIA_STORAGE",
  [
    v.object({ ...base, MEDIA_STORAGE: v.literal("local") }),
    v.object({
      ...base,
      MEDIA_STORAGE: v.literal("s3"),
      S3_ENDPOINT: httpUrl,
      S3_BUCKET: required,
      S3_REGION: required,
      S3_ACCESS_KEY_ID: required,
      S3_SECRET_ACCESS_KEY: required,
      // Unused for now: files are served at /media/<key> by the site zone (decisions #47).
      S3_PUBLIC_URL: v.optional(httpUrl),
    }),
  ],
  'Must be "local" or "s3"',
);
export type Env = v.InferOutput<typeof EnvSchema>;

export type EnvResult = { ok: true; env: Env } | { ok: false; message: string };

export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const result = v.safeParse(EnvSchema, source);
  if (result.success) return { ok: true, env: result.output };
  const lines = result.issues.map((issue) => {
    const key = issue.path?.map((item) => String(item.key)).join(".") || "MEDIA_STORAGE";
    const message = issue.input === undefined ? "Is not set" : issue.message;
    return `  ${key}: ${message}`;
  });
  return { ok: false, message: `Invalid environment:\n${lines.join("\n")}` };
}
