// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BlockListResult } from "@sitebuilder/schema";
import type { CheckContext } from "@sitebuilder/template-checks";
import { afterEach, describe, expect, test } from "vitest";
import { adminModule } from "./generate";
import { folderHash } from "./hash";
import { checkInstalled } from "./installed";
import { type LockEntry, readLockfile, writeLockfile } from "./lockfile";

const GOOD = join(import.meta.dirname, "..", "..", "template-checks", "fixtures", "good");

const context: CheckContext = {
  sitebuilderVersion: "0.1.0",
  nuvuiVersion: "0.8.0",
  validateContent: (input) => ({ ok: true, value: input }) as BlockListResult,
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sitebuilder-cli-"));
  dirs.push(dir);
  return dir;
}

// A repository with templates/default (the good fixture, renamed) locked as bundled.
async function repo(): Promise<{ root: string; entry: LockEntry }> {
  const root = await temp();
  const dir = join(root, "templates", "default");
  await cp(GOOD, dir, { recursive: true });
  const manifest = join(dir, "template.json");
  await writeFile(manifest, (await readFile(manifest, "utf8")).replace('"good"', '"default"'));
  const entry: LockEntry = {
    slug: "default",
    version: "1.0.0",
    source: "bundled",
    sha256: await folderHash(dir),
  };
  await writeLockfile(root, { lockfileVersion: 1, templates: [entry] });
  return { root, entry };
}

const rules = (findings: readonly { rule: string }[]) => findings.map((f) => f.rule);

describe("folderHash", () => {
  test("depends on paths and bytes, not on empty folders or the order files were made", async () => {
    const a = await temp();
    const b = await temp();
    await writeFile(join(a, "one.md"), "1");
    await writeFile(join(a, "two.md"), "2");
    await writeFile(join(b, "two.md"), "2");
    await writeFile(join(b, "one.md"), "1");
    await mkdir(join(b, "empty"));
    expect(await folderHash(a)).toBe(await folderHash(b));
    await writeFile(join(b, "two.md"), "2 ");
    expect(await folderHash(a)).not.toBe(await folderHash(b));
  });
});

describe("lockfile", () => {
  test("round-trips, sorted by slug", async () => {
    const root = await temp();
    const entry = (slug: string): LockEntry => ({
      slug,
      version: "1.0.0",
      source: "bundled",
      sha256: "a".repeat(64),
    });
    await writeLockfile(root, {
      lockfileVersion: 1,
      templates: [entry("studio"), entry("default")],
    });
    expect((await readLockfile(root)).templates.map((t) => t.slug)).toEqual(["default", "studio"]);
  });
});

describe("checkInstalled", () => {
  test("a locked, unchanged, passing template has no findings", async () => {
    const { root } = await repo();
    const report = await checkInstalled(root, context, { allowLocal: false });
    expect(report.findings).toEqual([]);
    expect(report.checked.map((c) => c.manifest?.slug)).toEqual(["default"]);
  });

  test("TPL-LOCK-001: a folder that isn't in the lockfile, but not dot-folders", async () => {
    const { root } = await repo();
    await mkdir(join(root, "templates", "stray"));
    await mkdir(join(root, "templates", ".turbo"));
    const report = await checkInstalled(root, context, { allowLocal: false });
    expect(report.findings.map((f) => [f.rule, f.slug])).toEqual([["TPL-LOCK-001", "stray"]]);
  });

  test("TPL-LOCK-002: a locked template that isn't there", async () => {
    const { root, entry } = await repo();
    await writeLockfile(root, {
      lockfileVersion: 1,
      templates: [entry, { ...entry, slug: "gone" }],
    });
    expect(rules((await checkInstalled(root, context, { allowLocal: false })).findings)).toEqual([
      "TPL-LOCK-002",
    ]);
  });

  test("TPL-LOCK-003: a template changed since it was locked", async () => {
    const { root } = await repo();
    await writeFile(join(root, "templates", "default", "NOTES.md"), "changed");
    expect(rules((await checkInstalled(root, context, { allowLocal: false })).findings)).toEqual([
      "TPL-LOCK-003",
    ]);
  });

  test("TPL-LOCK-004: an unreviewed template, unless allowed", async () => {
    const { root, entry } = await repo();
    await writeLockfile(root, { lockfileVersion: 1, templates: [{ ...entry, source: "local" }] });
    expect(rules((await checkInstalled(root, context, { allowLocal: false })).findings)).toEqual([
      "TPL-LOCK-004",
    ]);
    expect((await checkInstalled(root, context, { allowLocal: true })).findings).toEqual([]);
  });

  test("a template's own findings come through, named by template", async () => {
    const { root } = await repo();
    await rm(join(root, "templates", "default", "LICENSE"));
    const lock = await readLockfile(root);
    const [entry] = lock.templates;
    if (!entry) throw new Error("fixture");
    entry.sha256 = await folderHash(join(root, "templates", "default"));
    await writeLockfile(root, lock);
    const report = await checkInstalled(root, context, { allowLocal: false });
    expect(report.findings.map((f) => [f.rule, f.slug])).toEqual([["TPL-MANIFEST-004", "default"]]);
  });
});

describe("adminModule", () => {
  test("imports each screenshot and inlines the data, with no template code", async () => {
    const { root } = await repo();
    const report = await checkInstalled(root, context, { allowLocal: false });
    const source = adminModule(report.checked);
    expect(source).toContain('import shot0 from "../default/screenshots/home.png";');
    expect(source).toContain('"slug":"default"');
    expect(source).toContain('screenshots: [{ image: shot0, label: "The home page" }]');
    expect(source.match(/^import /gm)).toHaveLength(2);
  });
});
