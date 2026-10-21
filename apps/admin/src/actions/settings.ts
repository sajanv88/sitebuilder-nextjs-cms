"use server";

import { can } from "@sitebuilder/auth";
import { countPosts, db, getSettings, saveReadingSettings, upsertSettings } from "@sitebuilder/db";
import {
  DateSettingsInput,
  defaultSettings,
  ReadingSettingsInput,
  type SettingsValue,
  SiteSettingsInput,
} from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { env } from "@/env";
import { LATEST_POSTS } from "@/lib/reading";
import { invalidate } from "@/server/invalidate";

// Settings → Site, Reading and Dates (design §5.4). Admins only (§6.2: settings.update). Each
// form saves its own part; the rest of the row is kept.

export interface SettingsFormState<V extends Record<string, string>> {
  result: "idle" | "saved" | "invalid" | "failed" | "confirm";
  message?: string;
  errors?: Partial<Record<keyof V, string>>;
  values: V;
  // Posts that a new posts path would move, for the confirmation.
  moving?: number;
  at?: number;
}

export type SiteFormValues = { title: string; tagline: string; language: string; siteUrl: string };
export type ReadingFormValues = { homepage: string; postsPerPage: string; postsPath: string };
export type DateFormValues = { dateFormat: string; timeZone: string };

const SESSION_ENDED = "Your session has ended. Sign in again.";
const NOT_ALLOWED = "Only an admin can change the settings.";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function fieldErrors<V extends Record<string, string>>(
  issues: v.BaseIssue<unknown>[],
  rename: Partial<Record<string, keyof V>> = {},
): Partial<Record<keyof V, string>> {
  const errors: Partial<Record<keyof V, string>> = {};
  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key !== "string") continue;
    const field = (rename[key] ?? key) as keyof V;
    errors[field] ??= issue.message;
  }
  return errors;
}

async function allowed(): Promise<string | null> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  return can(viewer, "settings.update") ? null : NOT_ALLOWED;
}

async function currentSite(): Promise<SettingsValue<"site">> {
  return (await getSettings(db, "site")) ?? defaultSettings(env().SITE_URL).site;
}

export async function saveSiteSettings(
  _: SettingsFormState<SiteFormValues>,
  form: FormData,
): Promise<SettingsFormState<SiteFormValues>> {
  const values: SiteFormValues = {
    title: text(form, "title"),
    tagline: text(form, "tagline"),
    language: text(form, "language"),
    siteUrl: text(form, "siteUrl"),
  };
  const refused = await allowed();
  if (refused) return { result: "failed", message: refused, values };
  const input = v.safeParse(SiteSettingsInput, values);
  if (!input.success) {
    return {
      result: "invalid",
      message: "Check the fields marked below.",
      errors: fieldErrors<SiteFormValues>(input.issues),
      values,
    };
  }
  const saved = await upsertSettings(db, "site", { ...(await currentSite()), ...input.output });
  if (!saved.ok) return { result: "failed", message: "The settings couldn't be saved.", values };
  invalidate("saveSiteSettings");
  return { result: "saved", message: "Site settings saved.", values, at: Date.now() };
}

export async function saveReading(
  _: SettingsFormState<ReadingFormValues>,
  form: FormData,
): Promise<SettingsFormState<ReadingFormValues>> {
  const values: ReadingFormValues = {
    homepage: text(form, "homepage"),
    postsPerPage: text(form, "postsPerPage"),
    postsPath: text(form, "postsPath"),
  };
  const refused = await allowed();
  if (refused) return { result: "failed", message: refused, values };
  const input = v.safeParse(ReadingSettingsInput, {
    homepageEntryId: values.homepage === LATEST_POSTS ? "" : values.homepage,
    postsPerPage: values.postsPerPage,
    postsPath: values.postsPath,
  });
  if (!input.success) {
    return {
      result: "invalid",
      message: "Check the fields marked below.",
      errors: fieldErrors<ReadingFormValues>(input.issues, { homepageEntryId: "homepage" }),
      values,
    };
  }

  // A new posts path moves every post: say how many, and save only once that's confirmed.
  const current = await getSettings(db, "reading");
  if (
    current &&
    input.output.postsPath !== current.postsPath &&
    form.get("confirm") !== input.output.postsPath
  ) {
    return { result: "confirm", values, moving: await countPosts(db), at: Date.now() };
  }

  const result = await saveReadingSettings(db, input.output);
  if (!result.ok) {
    return result.error === "posts-path-taken"
      ? {
          result: "invalid",
          message: "Check the fields marked below.",
          errors: { postsPath: "A page already has that address. Choose another." },
          values,
        }
      : {
          result: "invalid",
          message: "Check the fields marked below.",
          errors: { homepage: "Choose a published page." },
          values,
        };
  }
  invalidate("saveReading");
  return {
    result: "saved",
    message:
      result.moved > 0
        ? `Reading settings saved. ${result.moved} ${result.moved === 1 ? "post" : "posts"} moved, with redirects from their old addresses.`
        : "Reading settings saved.",
    values: { ...values, postsPath: input.output.postsPath },
    at: Date.now(),
  };
}

export async function saveDateSettings(
  _: SettingsFormState<DateFormValues>,
  form: FormData,
): Promise<SettingsFormState<DateFormValues>> {
  const values: DateFormValues = {
    dateFormat: text(form, "dateFormat"),
    timeZone: text(form, "timeZone"),
  };
  const refused = await allowed();
  if (refused) return { result: "failed", message: refused, values };
  const input = v.safeParse(DateSettingsInput, values);
  if (!input.success) {
    return {
      result: "invalid",
      message: "Check the fields marked below.",
      errors: fieldErrors<DateFormValues>(input.issues),
      values,
    };
  }
  const saved = await upsertSettings(db, "site", { ...(await currentSite()), ...input.output });
  if (!saved.ok) return { result: "failed", message: "The settings couldn't be saved.", values };
  invalidate("saveDateSettings");
  return { result: "saved", message: "Date settings saved.", values, at: Date.now() };
}
