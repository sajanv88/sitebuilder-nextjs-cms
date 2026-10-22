// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { StarterContent, TemplateManifest } from "@sitebuilder/schema";
import { type CheckContext, type Finding, runChecks } from "@sitebuilder/template-checks";
import { folderHash } from "./hash";
import { CliError, LOCKFILE, type LockEntry, readLockfile } from "./lockfile";

// What the build installs (A3 steps 1 to 3): every template in the lockfile, present, unchanged
// since it was locked, allowed in this environment, and passing every check. A finding names
// the template it's about; the lockfile's own rules are TPL-LOCK-*.

export const TEMPLATES_DIR = "templates";
// Folders under templates/ that aren't templates.
const NOT_TEMPLATES = new Set(["generated", "node_modules", "src"]);

export interface Checked {
  entry: LockEntry;
  dir: string;
  manifest: TemplateManifest | null;
  starter: StarterContent | null;
}

export interface TemplateFinding extends Finding {
  slug: string;
}

export interface InstalledReport {
  checked: Checked[];
  findings: TemplateFinding[];
}

const exists = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

// The workspace root: the nearest folder upwards with pnpm-workspace.yaml.
export async function findRoot(from: string): Promise<string> {
  let dir = from;
  for (;;) {
    if (
      await stat(join(dir, "pnpm-workspace.yaml")).then(
        () => true,
        () => false,
      )
    )
      return dir;
    const parent = join(dir, "..");
    if (parent === dir) throw new CliError("Run this inside the Sitebuilder repository", 2);
    dir = parent;
  }
}

// The installed @nuvui/react, from the workspace catalog that pins it.
export async function nuvuiVersion(root: string): Promise<string> {
  const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  // Quoted either way: `turbo prune` writes the catalog back with single quotes.
  const match = /["']@nuvui\/react["']:\s*["']?(\d+\.\d+\.\d+)/.exec(workspace);
  if (!match?.[1]) throw new CliError("@nuvui/react isn't in the workspace catalog", 2);
  return match[1];
}

export async function checkInstalled(
  root: string,
  context: CheckContext,
  options: { allowLocal: boolean },
): Promise<InstalledReport> {
  const lock = await readLockfile(root);
  const base = join(root, TEMPLATES_DIR);
  const findings: TemplateFinding[] = [];
  const lockError = (slug: string, rule: string, message: string) =>
    findings.push({ slug, rule, severity: "error", file: ".", message });

  const listed = new Set(lock.templates.map((entry) => entry.slug));
  if (!listed.has("default"))
    lockError("default", "TPL-LOCK-001", `"default" must be in ${LOCKFILE}`);
  const folders = (await readdir(base, { withFileTypes: true }))
    .filter(
      // Dot-folders (.turbo) can't be templates: no slug starts with a dot.
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith(".") && !NOT_TEMPLATES.has(entry.name),
    )
    .map((entry) => entry.name);
  for (const folder of folders) {
    if (!listed.has(folder)) {
      lockError(
        folder,
        "TPL-LOCK-001",
        `templates/${folder} isn't in ${LOCKFILE}: add it with \`pnpm sitebuilder template lock ${folder}\` if it's bundled`,
      );
    }
  }

  const checked: Checked[] = [];
  for (const entry of lock.templates) {
    const dir = join(base, entry.slug);
    if (!(await exists(dir))) {
      lockError(
        entry.slug,
        "TPL-LOCK-002",
        `templates/${entry.slug} is in ${LOCKFILE} but isn't there`,
      );
      continue;
    }
    if ((await folderHash(dir)) !== entry.sha256) {
      lockError(
        entry.slug,
        "TPL-LOCK-003",
        `templates/${entry.slug} has changed since it was locked. Check the change, then run \`pnpm sitebuilder template lock ${entry.slug}\``,
      );
    }
    if (entry.source === "local" && !options.allowLocal) {
      lockError(
        entry.slug,
        "TPL-LOCK-004",
        `${entry.slug} hasn't been reviewed (source "local"). Set ALLOW_UNREVIEWED_TEMPLATES=true to build it in production`,
      );
    }
    const report = await runChecks(dir, context);
    findings.push(...report.findings.map((finding) => ({ ...finding, slug: entry.slug })));
    if (report.manifest && report.manifest.version !== entry.version) {
      lockError(
        entry.slug,
        "TPL-LOCK-003",
        `template.json says ${report.manifest.version}; ${LOCKFILE} says ${entry.version}`,
      );
    }
    checked.push({ entry, dir, manifest: report.manifest, starter: report.starter });
  }
  return { checked, findings };
}
