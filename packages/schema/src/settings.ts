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

// One schema per settings key, so a write names its key and gets the matching check.
export const SettingsSchemas = {
  site: SiteSettings,
  reading: ReadingSettings,
  theme: ThemeSettings,
} as const;
export type SettingsKey = keyof typeof SettingsSchemas;
export type SettingsValue<K extends SettingsKey> = v.InferOutput<(typeof SettingsSchemas)[K]>;

// The rows /setup writes.
export function defaultSettings(siteUrl: string): { [K in SettingsKey]: SettingsValue<K> } {
  return {
    site: { title: "My Site", tagline: "", language: "en", siteUrl },
    reading: { homepageEntryId: null, postsPerPage: 10, postsPath: "/blog" },
    theme: { preset: "default", mode: "system", density: "default", tokens: {} },
  };
}
