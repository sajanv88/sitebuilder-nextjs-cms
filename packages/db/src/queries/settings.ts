import {
  type DefaultSettingsKey,
  type SettingsKey,
  SettingsSchemas,
  type SettingsValue,
} from "@sitebuilder/schema";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import type { Executor } from "../executor";
import { settings } from "../schema/site";

// Settings rows hold JSON. Writes validate against the key's schema; reads parse too, so a row
// edited by hand can't reach the app in the wrong shape.

export async function getSettings<K extends SettingsKey>(
  db: Executor,
  key: K,
): Promise<SettingsValue<K> | undefined> {
  const row = await db.query.settings.findFirst({ where: { key } });
  if (!row) return undefined;
  return v.parse(SettingsSchemas[key], row.value) as SettingsValue<K>;
}

export type UpsertSettingsResult =
  | { ok: true }
  | { ok: false; error: "invalid"; issues: v.BaseIssue<unknown>[] };

export async function upsertSettings<K extends SettingsKey>(
  db: Executor,
  key: K,
  value: unknown,
): Promise<UpsertSettingsResult> {
  const parsed = v.safeParse(SettingsSchemas[key], value);
  if (!parsed.success) return { ok: false, error: "invalid", issues: parsed.issues };
  await db
    .insert(settings)
    .values({ key, value: parsed.output })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed.output } });
  return { ok: true };
}

// Removes a row. For `media`, that hands the choice back to the environment (decisions #45).
export async function deleteSettings(db: Executor, key: SettingsKey): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

// Writes each default only where the key has no row yet. Used by the bootstrap.
export async function insertDefaultSettings(
  db: Executor,
  defaults: { [K in DefaultSettingsKey]: SettingsValue<K> },
): Promise<void> {
  const rows = (Object.keys(defaults) as DefaultSettingsKey[]).map((key) => ({
    key,
    value: defaults[key],
  }));
  await db.insert(settings).values(rows).onConflictDoNothing({ target: settings.key });
}
