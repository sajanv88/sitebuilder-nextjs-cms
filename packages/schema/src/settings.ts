import * as v from "valibot";
import { Uuid } from "./shared";

// Settings rows (design §5.4). Each value is validated by its schema on every write.

export const SiteSettings = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  tagline: v.pipe(v.string(), v.maxLength(200)),
  language: v.pipe(v.string(), v.regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)), // "en", "nl-NL"
  siteUrl: v.pipe(v.string(), v.url()), // canonical base URL
});
export type SiteSettings = v.InferOutput<typeof SiteSettings>;

export const ReadingSettings = v.object({
  homepageEntryId: v.nullable(Uuid),
  postsPerPage: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  postsPath: v.pipe(v.string(), v.regex(/^\/[a-z0-9-]+$/)), // "/blog"
});
export type ReadingSettings = v.InferOutput<typeof ReadingSettings>;

// Token overrides: names limited to NuvUI's families, values limited to plain CSS values.
export const TokenName = v.pipe(
  v.string(),
  v.regex(/^--(color|radius|spacing|font|text)-[a-z0-9-]+$/),
);
export const TokenValue = v.pipe(
  v.string(),
  v.maxLength(80),
  v.regex(/^[#a-zA-Z0-9%.,()\s/_-]+$/),
  v.check((s) => !/url\(|expression|import|javascript/i.test(s), "Unsafe value"),
);

export const ThemeSettings = v.object({
  preset: v.picklist(["default", "ember", "high-contrast", "ink", "ledger", "meadow"]),
  mode: v.picklist(["light", "dark", "system"]),
  density: v.picklist(["compact", "default", "comfortable"]),
  tokens: v.record(
    TokenName,
    v.object({ light: v.optional(TokenValue), dark: v.optional(TokenValue) }),
  ),
});
export type ThemeSettings = v.InferOutput<typeof ThemeSettings>;

// ── Media storage ────────────────────────────────────────────────────────────────────────────
// Where uploads go, when an admin has chosen in Settings (decisions #45). No row means the
// environment decides (MEDIA_STORAGE and the S3_* variables), as design §9 says.

// An S3 endpoint an admin types in. The server sends signed requests to it, so it must be
// https, and it can't be a link-local or cloud-metadata address (nextjs-security rule 10).
const BLOCKED_HOSTS =
  /^(169\.254\.|\[fe80:|\[fd00:ec2::254\](:\d+)?$|metadata\.google\.internal\.?(:\d+)?$)/i;
export const S3Endpoint = v.pipe(
  v.string(),
  v.trim(),
  v.url("Enter the endpoint's address, such as https://minio.example.com"),
  v.check((s) => s.startsWith("https://"), "The endpoint must start with https://"),
  // The address alone: a host, an optional port, no path or query.
  v.check((s) => {
    const host = /^https:\/\/([^/?#@]+)\/?$/.exec(s)?.[1];
    return host !== undefined && !BLOCKED_HOSTS.test(host);
  }, "Enter only the endpoint's address, without a path, and not a link-local address"),
  v.transform((s) => s.replace(/\/+$/, "")),
);

// S3 bucket naming rules: 3 to 63 lowercase letters, digits, dots and hyphens.
export const S3Bucket = v.pipe(
  v.string(),
  v.trim(),
  v.regex(
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
    "Use 3 to 63 lowercase letters, digits, dots or hyphens",
  ),
);
export const S3Region = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[a-z0-9-]{1,40}$/, "Use lowercase letters, digits and hyphens, such as us-east-1"),
);
// Printable ASCII without spaces, as access keys are.
export const S3AccessKeyId = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[!-~]{1,128}$/, "Enter the access key id"),
);
export const S3SecretInput = v.pipe(
  v.string(),
  v.regex(/^[!-~]{1,256}$/, "Enter the secret access key"),
);

// The secret access key as stored: AES-256-GCM, each part base64url (packages/media seals it).
const base64url = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]+$/));
export const SealedSecret = v.object({ iv: base64url, tag: base64url, data: base64url });
export type SealedSecret = v.InferOutput<typeof SealedSecret>;

export const MediaStorageSettings = v.variant("driver", [
  v.object({ driver: v.literal("local") }),
  v.object({
    driver: v.literal("s3"),
    endpoint: S3Endpoint,
    region: S3Region,
    bucket: S3Bucket,
    accessKeyId: S3AccessKeyId,
    secret: SealedSecret,
    // Path-style addressing (https://host/bucket/key), which MinIO needs.
    pathStyle: v.boolean(),
  }),
]);
export type MediaStorageSettings = v.InferOutput<typeof MediaStorageSettings>;

// What the Settings form sends. "environment" removes the saved choice. The secret is plain
// text here and optional: left blank, the saved one is kept.
export const MediaStorageInput = v.variant("driver", [
  v.object({ driver: v.literal("environment") }),
  v.object({ driver: v.literal("local") }),
  v.object({
    driver: v.literal("s3"),
    endpoint: S3Endpoint,
    region: S3Region,
    bucket: S3Bucket,
    accessKeyId: S3AccessKeyId,
    secret: v.optional(S3SecretInput),
    pathStyle: v.boolean(),
  }),
]);
export type MediaStorageInput = v.InferOutput<typeof MediaStorageInput>;

// One schema per settings key, so a write names its key and gets the matching check.
export const SettingsSchemas = {
  site: SiteSettings,
  reading: ReadingSettings,
  theme: ThemeSettings,
  media: MediaStorageSettings,
} as const;
export type SettingsKey = keyof typeof SettingsSchemas;
export type SettingsValue<K extends SettingsKey> = v.InferOutput<(typeof SettingsSchemas)[K]>;

// The keys /setup writes. `media` isn't one: without a row, the environment decides.
export type DefaultSettingsKey = Exclude<SettingsKey, "media">;

// The rows /setup writes.
export function defaultSettings(siteUrl: string): {
  [K in DefaultSettingsKey]: SettingsValue<K>;
} {
  return {
    site: { title: "My Site", tagline: "", language: "en", siteUrl },
    reading: { homepageEntryId: null, postsPerPage: 10, postsPath: "/blog" },
    theme: { preset: "default", mode: "system", density: "default", tokens: {} },
  };
}
