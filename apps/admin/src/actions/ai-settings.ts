// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import {
  AI_ERROR_MESSAGES,
  type AiConnection,
  type AiModel,
  type AiSettingsView,
  aiSettingsView,
  lastFour,
  openKey,
  sealKey,
} from "@sitebuilder/ai";
import { can } from "@sitebuilder/auth";
import { db, deleteSettings, getSettings, upsertSettings } from "@sitebuilder/db";
import {
  AiConnectionInput,
  type AiProviderName,
  type AiSettings,
  AiSettingsInput,
} from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { env } from "@/env";
import { aiProvider } from "@/server/ai";

// Settings → AI, admins only (settings.update). Connect lists the models the provider offers
// this key, which checks the address and the key; Save does the same before it stores
// anything, and refuses a model the provider doesn't have. The key is sealed before it's stored
// and never sent back (templates_and_ai_design B3). The AI settings aren't on the public site,
// so nothing is invalidated.

export type AiField = "key" | "baseUrl" | "model" | "dailyTokenLimit";

// What the form sends. The key is what was typed: empty keeps the saved one.
export interface AiFormValues {
  provider: AiProviderName | "off";
  key: string;
  baseUrl: string;
  model: string;
  dailyTokenLimit: number | null;
  supportsImages: boolean;
}

export type AiFormResult =
  | { ok: true; message: string; models: AiModel[]; view?: AiSettingsView }
  | { ok: false; message: string; errors?: Partial<Record<AiField, string>> };

const refuse = (message: string, errors?: Partial<Record<AiField, string>>): AiFormResult => ({
  ok: false,
  message,
  ...(errors ? { errors } : {}),
});

const CHECK_FIELDS = "Check the fields marked below.";

function firstErrors(
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
): Partial<Record<AiField, string>> {
  const nested = v.flatten(issues).nested ?? {};
  const errors: Partial<Record<AiField, string>> = {};
  for (const name of ["key", "baseUrl", "model", "dailyTokenLimit"] as const) {
    const message = nested[name]?.[0];
    if (message) errors[name] = message;
  }
  return errors;
}

async function allowed(): Promise<AiFormResult | null> {
  const viewer = await getViewer();
  if (!viewer) return refuse("Your session has ended. Sign in again.");
  if (!can(viewer, "settings.update")) return refuse("You can't change settings.");
  return null;
}

// The key to use: the one typed, or the saved one if it was saved for this same provider (and
// for Ollama, this same address: a saved key never goes to a server it wasn't typed for).
async function connectionFor(
  input: AiConnectionInput,
): Promise<{ ok: true; connection: AiConnection } | { ok: false; result: AiFormResult }> {
  const saved = await getSettings(db, "ai");
  const sameTarget =
    saved?.provider === input.provider &&
    (input.provider !== "ollama" ||
      (saved.provider === "ollama" && saved.baseUrl === input.baseUrl));
  const savedKey = sameTarget && saved?.key ? openKey(saved.key, env().AUTH_SECRET) : null;
  const key = input.key ?? savedKey ?? undefined;
  if (input.provider === "ollama") {
    return {
      ok: true,
      connection: { provider: "ollama", baseUrl: input.baseUrl, ...(key ? { key } : {}) },
    };
  }
  if (!key) {
    return { ok: false, result: refuse(CHECK_FIELDS, { key: "Enter the API key" }) };
  }
  return { ok: true, connection: { provider: input.provider, key } };
}

// Lists the models, which is how both buttons check the connection.
async function listModels(
  connection: AiConnection,
): Promise<{ ok: true; models: AiModel[] } | { ok: false; result: AiFormResult }> {
  const listed = await aiProvider(connection).listModels(AbortSignal.timeout(20_000));
  if (listed.ok) return { ok: true, models: listed.value };
  const { code, detail } = listed.error;
  const message = `${AI_ERROR_MESSAGES[code]}${detail ? ` (${detail})` : ""}`;
  const errors =
    code === "auth"
      ? { key: "The provider rejected this key" }
      : code === "blocked_url"
        ? { baseUrl: "This address isn't allowed" }
        : undefined;
  return { ok: false, result: refuse(message, errors) };
}

const typedKey = (key: string) => (key.trim() === "" ? {} : { key: key.trim() });

export async function testAiConnection(values: AiFormValues): Promise<AiFormResult> {
  const denied = await allowed();
  if (denied) return denied;
  if (values.provider === "off") return refuse("Choose a provider first.");

  const input = v.safeParse(AiConnectionInput, {
    provider: values.provider,
    ...(values.provider === "ollama" ? { baseUrl: values.baseUrl } : {}),
    ...typedKey(values.key),
  });
  if (!input.success) return refuse(CHECK_FIELDS, firstErrors(input.issues));

  const connection = await connectionFor(input.output);
  if (!connection.ok) return connection.result;
  const listed = await listModels(connection.connection);
  if (!listed.ok) return listed.result;
  const count = listed.models.length;
  return {
    ok: true,
    models: listed.models,
    message:
      count === 0
        ? values.provider === "ollama"
          ? "Connected, but the server has no models yet. Add one with ollama pull, then connect again."
          : "Connected, but this key can't use any models."
        : `Connected. ${count} ${count === 1 ? "model is" : "models are"} available.`,
  };
}

export async function saveAiSettings(values: AiFormValues): Promise<AiFormResult> {
  const denied = await allowed();
  if (denied) return denied;

  // Off: the settings go, and the key with them.
  if (values.provider === "off") {
    await deleteSettings(db, "ai");
    return {
      ok: true,
      message: "The assistant is off. Its settings, and any saved key, were removed.",
      models: [],
      view: aiSettingsView(undefined, env().AUTH_SECRET),
    };
  }

  const input = v.safeParse(AiSettingsInput, {
    provider: values.provider,
    ...(values.provider === "ollama" ? { baseUrl: values.baseUrl } : {}),
    ...typedKey(values.key),
    model: values.model,
    dailyTokenLimit: values.dailyTokenLimit ?? undefined,
    supportsImages: values.supportsImages,
  });
  if (!input.success) return refuse(CHECK_FIELDS, firstErrors(input.issues));
  const choice = input.output;
  if (choice.provider === "off") return refuse("Choose a provider first.");

  const connection = await connectionFor(choice);
  if (!connection.ok) return connection.result;
  const listed = await listModels(connection.connection);
  if (!listed.ok) return { ...listed.result, message: `Not saved. ${listed.result.message}` };
  if (!listed.models.some((model) => model.id === choice.model)) {
    return refuse(CHECK_FIELDS, { model: "The provider doesn't offer this model to this key" });
  }

  const { AUTH_SECRET } = env();
  const key = connection.connection.key;
  const shared = {
    model: choice.model,
    dailyTokenLimit: choice.dailyTokenLimit,
    supportsImages: choice.supportsImages,
  };
  const sealed = key ? { key: sealKey(key, AUTH_SECRET), keyLast4: lastFour(key) } : {};
  let settings: AiSettings;
  if (choice.provider === "ollama") {
    settings = { provider: "ollama", baseUrl: choice.baseUrl, ...shared, ...sealed };
  } else if (sealed.key) {
    settings = { provider: choice.provider, ...shared, key: sealed.key, keyLast4: sealed.keyLast4 };
  } else {
    return refuse(CHECK_FIELDS, { key: "Enter the API key" });
  }

  const written = await upsertSettings(db, "ai", settings);
  if (!written.ok) return refuse("Those settings couldn't be saved.");
  return {
    ok: true,
    message: "AI settings saved.",
    models: listed.models,
    view: aiSettingsView(settings, AUTH_SECRET),
  };
}
