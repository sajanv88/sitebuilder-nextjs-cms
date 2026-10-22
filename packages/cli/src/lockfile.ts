// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TemplateSlug } from "@sitebuilder/schema";
import * as v from "valibot";

// templates/templates.lock.json (A3): what's installed, pinned by version and folder hash.
// Committed. It sits in the templates package, not the repo root, so `turbo prune` carries it
// into the Docker build with the templates.

export const LOCKFILE = "templates/templates.lock.json";

const LockEntry = v.strictObject({
  slug: TemplateSlug,
  version: v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+$/)),
  // "marketplace" arrives in phase 9.
  source: v.picklist(["bundled", "local"]),
  sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
});
export type LockEntry = v.InferOutput<typeof LockEntry>;

const Lockfile = v.strictObject({
  lockfileVersion: v.literal(1),
  templates: v.array(LockEntry),
});
export type Lockfile = v.InferOutput<typeof Lockfile>;

export async function readLockfile(root: string): Promise<Lockfile> {
  let text: string;
  try {
    text = await readFile(join(root, LOCKFILE), "utf8");
  } catch {
    throw new CliError(`There's no ${LOCKFILE} at ${root}`, 2);
  }
  const parsed = v.safeParse(Lockfile, JSON.parse(text));
  if (!parsed.success) {
    throw new CliError(`${LOCKFILE} isn't valid: ${parsed.issues[0]?.message ?? ""}`, 1);
  }
  return parsed.output;
}

// Sorted by slug, two-space JSON with a final newline, so a change is one readable diff.
export async function writeLockfile(root: string, lock: Lockfile): Promise<void> {
  const templates = [...lock.templates].sort((a, b) => a.slug.localeCompare(b.slug));
  await mkdir(dirname(join(root, LOCKFILE)), { recursive: true });
  await writeFile(
    join(root, LOCKFILE),
    `${JSON.stringify({ lockfileVersion: 1, templates }, null, 2)}\n`,
  );
}

// A failure with its exit code: 1 for findings or a hash mismatch, 2 for usage or I/O (A6).
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2,
  ) {
    super(message);
  }
}
