// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import {
  countMediaByStorage,
  db,
  deleteSettings,
  getSettings,
  upsertSettings,
} from "@sitebuilder/db";
import {
  diskStorage,
  type MediaStorage,
  openSecret,
  s3Storage,
  sealSecret,
  uploadStorage,
} from "@sitebuilder/media";
import { type Env, MediaStorageInput, type MediaStorageSettings } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { env } from "@/env";
import { invalidate } from "@/server/invalidate";

// Settings → Media storage (decisions #45), admins only (settings.update, design §6.2). Both
// actions check the connection first: Test reports it, Save refuses to switch to storage that
// doesn't work. The secret key is sealed before it's stored and never sent back (decisions #46).

type Driver = "environment" | "local" | "s3";
type FieldName = "endpoint" | "region" | "bucket" | "accessKeyId" | "secret";

export interface StorageFormValues {
  driver: Driver;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  pathStyle: boolean;
}

export interface StorageFormState {
  result: "idle" | "tested" | "saved" | "invalid" | "failed" | "confirm";
  message?: string;
  errors?: Partial<Record<FieldName, string>>;
  // What was typed, never the secret: React resets a form after its action runs.
  values: StorageFormValues;
  // When the answer was given: the form shows whichever of Test and Save answered last.
  at?: number;
}

const stamped = (state: StorageFormState): StorageFormState => ({ ...state, at: Date.now() });

function readValues(form: FormData): StorageFormValues {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.slice(0, 300) : "";
  };
  const driver = text("driver");
  return {
    driver: driver === "local" || driver === "s3" ? driver : "environment",
    endpoint: text("endpoint"),
    region: text("region"),
    bucket: text("bucket"),
    accessKeyId: text("accessKeyId"),
    pathStyle: form.get("pathStyle") === "on",
  };
}

type Prepared =
  | { ok: true; settings: MediaStorageSettings | null; storage: MediaStorage }
  | { ok: false; state: StorageFormState };

// Checks the form and builds the storage it describes, without saving anything.
async function prepare(form: FormData): Promise<Prepared> {
  const values = readValues(form);
  const fail = (
    result: StorageFormState["result"],
    message: string,
    errors?: StorageFormState["errors"],
  ): Prepared => ({ ok: false, state: { result, message, values, ...(errors ? { errors } : {}) } });

  const viewer = await getViewer();
  if (!viewer) return fail("failed", "Your session has ended. Sign in again.");
  if (!can(viewer, "settings.update")) return fail("failed", "You can't change settings.");

  const secretTyped = form.get("secret");
  const input = v.safeParse(MediaStorageInput, {
    ...values,
    ...(typeof secretTyped === "string" && secretTyped !== "" ? { secret: secretTyped } : {}),
  });
  if (!input.success) {
    const nested = v.flatten(input.issues).nested ?? {};
    const first = (key: FieldName) => (nested[key]?.[0] ? { [key]: nested[key][0] } : {});
    return fail("invalid", "Check the fields marked below.", {
      ...first("endpoint"),
      ...first("region"),
      ...first("bucket"),
      ...first("accessKeyId"),
      ...first("secret"),
    });
  }

  const config: Env = env();
  const choice = input.output;
  if (choice.driver === "environment") {
    const from = uploadStorage({ settings: undefined, env: config });
    if (!from.ok) return fail("failed", "The server's storage settings can't be used.");
    return { ok: true, settings: null, storage: from.storage };
  }
  if (choice.driver === "local") {
    return {
      ok: true,
      settings: { driver: "local" },
      storage: diskStorage(config.MEDIA_LOCAL_DIR),
    };
  }

  // A blank secret keeps the saved one, if there is one and it can still be read.
  const saved = await getSettings(db, "media");
  const secret =
    choice.secret ?? (saved?.driver === "s3" ? openSecret(saved.secret, config.AUTH_SECRET) : null);
  if (!secret) {
    return fail("invalid", "Check the fields marked below.", {
      secret: "Enter the secret access key",
    });
  }
  const { secret: _typed, driver, ...connection } = choice;
  return {
    ok: true,
    settings: { driver, ...connection, secret: sealSecret(secret, config.AUTH_SECRET) },
    storage: s3Storage({ ...connection, secretAccessKey: secret }),
  };
}

const STEPS = { write: "Storing a test file", read: "Reading it back", delete: "Deleting it" };

export async function testStorage(_: StorageFormState, form: FormData): Promise<StorageFormState> {
  return stamped(await test(form));
}

async function test(form: FormData): Promise<StorageFormState> {
  const prepared = await prepare(form);
  if (!prepared.ok) return prepared.state;
  const values = readValues(form);
  const probe = await prepared.storage.probe();
  return probe.ok
    ? {
        result: "tested",
        message: "Connected: a test file was stored, read back and deleted.",
        values,
      }
    : { result: "failed", message: `${STEPS[probe.step]} failed: ${probe.message}`, values };
}

// The S3 bucket files are read from: the saved settings if they're S3, else the environment's.
function s3Source(settings: MediaStorageSettings | null | undefined, config: Env): string | null {
  if (settings?.driver === "s3") return `${settings.bucket} at ${settings.endpoint}`;
  if (config.MEDIA_STORAGE === "s3") {
    return `${config.S3_BUCKET} at ${config.S3_ENDPOINT.replace(/\/+$/, "")}`;
  }
  return null;
}

export async function saveStorage(_: StorageFormState, form: FormData): Promise<StorageFormState> {
  return stamped(await save(form));
}

async function save(form: FormData): Promise<StorageFormState> {
  const prepared = await prepare(form);
  if (!prepared.ok) return prepared.state;
  const values = readValues(form);

  const probe = await prepared.storage.probe();
  if (!probe.ok) {
    return {
      result: "failed",
      message: `Not saved. ${STEPS[probe.step]} failed: ${probe.message}`,
      values,
    };
  }

  // Files aren't moved (decisions #48). If files stored in S3 would be read from somewhere
  // else after this, say how many and ask first.
  const config = env();
  const before = s3Source(await getSettings(db, "media"), config);
  const after = s3Source(prepared.settings, config);
  const { s3: inS3 } = await countMediaByStorage(db);
  if (inS3 > 0 && before !== after && form.get("confirm") !== "1") {
    return {
      result: "confirm",
      message: `${inS3} ${inS3 === 1 ? "file is" : "files are"} stored in ${before ?? "S3"}. After this change ${inS3 === 1 ? "it" : "they"} won't load unless the new settings can read that bucket. Files aren't moved.`,
      values,
    };
  }

  if (prepared.settings) {
    const written = await upsertSettings(db, "media", prepared.settings);
    if (!written.ok)
      return { result: "failed", message: "Those settings couldn't be saved.", values };
  } else {
    await deleteSettings(db, "media");
  }
  invalidate("saveStorage");
  return {
    result: "saved",
    message: "Media storage saved. New uploads go there.",
    values,
  };
}
