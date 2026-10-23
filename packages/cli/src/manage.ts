// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { TemplateSlug } from "@sitebuilder/schema";
import { type CheckContext, type Finding, runChecks } from "@sitebuilder/template-checks";
import * as v from "valibot";
import { folderHash } from "./hash";
import { TEMPLATES_DIR } from "./installed";
import { CliError, type LockEntry, readLockfile, writeLockfile } from "./lockfile";

// `template add` and `template remove` (docs/templates_and_ai_design.md A6). A template comes in
// only after passing every check, from a copy, so the folder it came from can't change between
// the check and the install; it's locked as "local" (not reviewed). Installing happens at build
// time: the site uses a template once it's built again.

export class AddFindings extends CliError {
  constructor(readonly findings: readonly Finding[]) {
    super(
      `${findings.filter((f) => f.severity === "error").length} problem(s): nothing was added`,
      1,
    );
  }
}

// The slug the folder says it is, or its own name. The checks then hold it to the folder's name
// (TPL-MANIFEST-002), and the manifest's to its rules.
async function claimedSlug(dir: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(join(dir, "template.json"), "utf8"));
    if (v.is(TemplateSlug, manifest?.slug)) return manifest.slug;
  } catch {
    // The checks report a missing or broken manifest.
  }
  return basename(dir);
}

// A name or an address rather than a folder: that's the marketplace, which comes later.
const fromMarketplace = (source: string) =>
  /^[a-z][a-z0-9-]*(@\S+)?$/.test(source) || /^[a-z]+:\/\//i.test(source);

export async function addTemplate(
  root: string,
  source: string,
  context: CheckContext,
  { replace }: { replace: boolean },
): Promise<{ entry: LockEntry; findings: readonly Finding[]; replaced: boolean }> {
  const from = resolve(source);
  if (!existsSync(from)) {
    throw new CliError(
      fromMarketplace(source)
        ? "Adding a template by name, from the marketplace, arrives in a later version. Add one from a folder: pnpm sitebuilder template add <path>"
        : `There's no folder at ${source}`,
      2,
    );
  }
  if (!(await stat(from)).isDirectory()) throw new CliError(`${source} isn't a folder`, 2);

  const slug = await claimedSlug(from);
  const lock = await readLockfile(root);
  const existing = lock.templates.find((t) => t.slug === slug);
  const target = join(root, TEMPLATES_DIR, slug);
  if (existing?.source === "bundled") {
    throw new CliError(
      `${slug} comes with Sitebuilder. Edit it in place and run \`pnpm sitebuilder template lock ${slug}\`, or give yours another slug`,
      2,
    );
  }
  if ((existing || existsSync(target)) && !replace) {
    throw new CliError(
      `${slug} is installed already. To put this one in its place: pnpm sitebuilder template add ${source} --replace`,
      2,
    );
  }

  // A copy beside the installed templates (a dot-folder, which the lockfile's checks pass over),
  // so it's checked as it will be installed, and moved into place in one step.
  const staging = await mkdtemp(join(root, TEMPLATES_DIR, ".add-"));
  try {
    const copy = join(staging, slug);
    await cp(from, copy, { recursive: true, verbatimSymlinks: true });
    const report = await runChecks(copy, context);
    if (report.findings.some((f) => f.severity === "error") || !report.manifest) {
      throw new AddFindings(report.findings);
    }
    const entry: LockEntry = {
      slug,
      version: report.manifest.version,
      source: "local",
      sha256: await folderHash(copy),
    };
    if (existsSync(target)) await rm(target, { recursive: true, force: true });
    await rename(copy, target);
    await writeLockfile(root, {
      lockfileVersion: 1,
      templates: [...lock.templates.filter((t) => t.slug !== slug), entry],
    });
    return { entry, findings: report.findings, replaced: existing !== undefined };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function removeTemplate(root: string, slug: string): Promise<LockEntry> {
  if (slug === "default") {
    throw new CliError("The default template can't be removed: every other falls back to it", 2);
  }
  const lock = await readLockfile(root);
  const entry = lock.templates.find((t) => t.slug === slug);
  if (!entry || !v.is(TemplateSlug, slug)) throw new CliError(`${slug} isn't installed`, 2);
  await rm(join(root, TEMPLATES_DIR, slug), { recursive: true, force: true });
  await writeLockfile(root, {
    lockfileVersion: 1,
    templates: lock.templates.filter((t) => t.slug !== slug),
  });
  return entry;
}
