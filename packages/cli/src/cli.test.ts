// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BlockListResult } from "@sitebuilder/schema";
import type { CheckContext } from "@sitebuilder/template-checks";
import { afterEach, describe, expect, test } from "vitest";
import { adminModule, writeGenerated } from "./generate";
import { folderHash } from "./hash";
import { checkInstalled } from "./installed";
import { type LockEntry, readLockfile, writeLockfile } from "./lockfile";
import { AddFindings, addTemplate, removeTemplate } from "./manage";

const FIXTURES = join(import.meta.dirname, "..", "..", "template-checks", "fixtures");
const GOOD = join(FIXTURES, "good");
const DEFAULT = join(import.meta.dirname, "..", "..", "..", "templates", "default");

const context: CheckContext = {
  sitebuilderVersion: "0.1.0",
  nuvuiVersion: "0.8.0",
  validateContent: (input) => ({ ok: true, value: input }) as BlockListResult,
  resolveDir: join(import.meta.dirname, "..", "..", "..", "templates"),
  // As templates/package.json allows.
  nuvuiPackages: [
    "@nuvui/backgrounds",
    "@nuvui/icons",
    "@nuvui/media",
    "@nuvui/react",
    "@nuvui/table",
  ],
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

describe("template add and remove", () => {
  // A template folder outside the repository, as an author would have it.
  async function authored(): Promise<string> {
    const dir = join(await temp(), "good");
    await cp(GOOD, dir, { recursive: true });
    return dir;
  }

  test("add checks a copy, installs it as local, and leaves no staging folder", async () => {
    const { root } = await repo();
    const source = await authored();
    const { entry, replaced } = await addTemplate(root, source, context, { replace: false });
    expect(entry).toMatchObject({ slug: "good", version: "1.0.0", source: "local" });
    expect(replaced).toBe(false);
    expect(entry.sha256).toBe(await folderHash(join(root, "templates", "good")));
    expect((await readLockfile(root)).templates.map((t) => t.slug)).toEqual(["default", "good"]);
    expect((await readdir(join(root, "templates"))).filter((name) => name.startsWith("."))).toEqual(
      [],
    );
    // The lockfile's own checks accept it outside production.
    const report = await checkInstalled(root, context, { allowLocal: true });
    expect(report.findings).toEqual([]);
  });

  test("add refuses an installed slug unless --replace, and a bundled one always", async () => {
    const { root } = await repo();
    const source = await authored();
    await addTemplate(root, source, context, { replace: false });
    await writeFile(join(source, "NOTES.md"), "second version");
    await expect(addTemplate(root, source, context, { replace: false })).rejects.toThrow(
      "is installed already",
    );
    const { replaced, entry } = await addTemplate(root, source, context, { replace: true });
    expect(replaced).toBe(true);
    expect(await readFile(join(root, "templates", "good", "NOTES.md"), "utf8")).toBe(
      "second version",
    );
    expect(entry.sha256).toBe(await folderHash(join(root, "templates", "good")));

    const manifest = join(source, "template.json");
    await writeFile(manifest, (await readFile(manifest, "utf8")).replace('"good"', '"default"'));
    await expect(addTemplate(root, source, context, { replace: true })).rejects.toThrow(
      "comes with Sitebuilder",
    );
  });

  test("add installs nothing when the checks fail, and says which rule", async () => {
    const { root } = await repo();
    const source = await authored();
    await rm(join(source, "LICENSE"));
    const failed = addTemplate(root, source, context, { replace: false });
    await expect(failed).rejects.toBeInstanceOf(AddFindings);
    await failed.catch((error: AddFindings) => {
      expect(rules(error.findings)).toEqual(["TPL-MANIFEST-004"]);
    });
    expect(await readdir(join(root, "templates"))).not.toContain("good");
    expect((await readdir(join(root, "templates"))).filter((name) => name.startsWith("."))).toEqual(
      [],
    );
    expect((await readLockfile(root)).templates.map((t) => t.slug)).toEqual(["default"]);
  });

  test("add by name says the marketplace comes later", async () => {
    const { root } = await repo();
    await expect(addTemplate(root, "ledger@1.0.0", context, { replace: false })).rejects.toThrow(
      "arrives in a later version",
    );
  });

  test("remove takes the folder and the lock entry, but never the default", async () => {
    const { root } = await repo();
    await addTemplate(root, await authored(), context, { replace: false });
    await expect(removeTemplate(root, "default")).rejects.toThrow("can't be removed");
    await expect(removeTemplate(root, "nothing")).rejects.toThrow("isn't installed");
    expect((await removeTemplate(root, "good")).slug).toBe("good");
    expect(await readdir(join(root, "templates"))).not.toContain("good");
    expect((await readLockfile(root)).templates.map((t) => t.slug)).toEqual(["default"]);
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

describe("writeGenerated", () => {
  // The real default template, and the code fixture beside it with its stylesheet and block.
  async function withCode(): Promise<string> {
    const root = await temp();
    const entries: LockEntry[] = [];
    for (const [slug, from] of [
      ["default", DEFAULT],
      ["code", join(FIXTURES, "code")],
    ] as const) {
      const dir = join(root, "templates", slug);
      await cp(from, dir, { recursive: true });
      entries.push({ slug, version: "1.0.0", source: "bundled", sha256: await folderHash(dir) });
    }
    await writeLockfile(root, { lockfileVersion: 1, templates: entries });
    return root;
  }

  test("writes loaders, and each stylesheet under a hash of what's served", async () => {
    const root = await withCode();
    const report = await checkInstalled(root, context, { allowLocal: false });
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    await writeGenerated(root, report.checked);

    const generated = join(root, "templates", "generated");
    const site = await readFile(join(generated, "site.ts"), "utf8");
    // Imported statically, each under its own name, with no lazy import().
    const imported = (file: string) =>
      new RegExp(`^import (C\\d+) from "\\.\\./${file}";$`, "m").exec(site)?.[1];
    const notFound = imported("default/components/NotFound");
    const codeSite = imported("code/components/Site");
    expect(site).toContain(`notFound: ${notFound},`);
    expect(site).toContain(`site: ${codeSite},`);
    expect(imported("code/components/Archive")).toBeUndefined();
    expect(site).toContain(
      `"code:testimonial": ${imported("code/components/blocks/Testimonial")} as TemplateBlock`,
    );
    expect(site).toContain('import type { TemplateBlock } from "@sitebuilder/template-sdk";');
    expect(site).not.toContain("import(");
    // Both zones register the blocks from data: the code template's, and no layout code.
    const blocks = await readFile(join(generated, "blocks.ts"), "utf8");
    expect(blocks).toContain('{ slug: "code", name: "Code", blocks: [{"name":"testimonial"');
    expect(blocks).not.toContain('slug: "default"');
    expect(blocks).not.toMatch(/import\(|^import (?!type)/m);
    // The canvas draws blocks in the browser: their components, and no layout.
    const canvas = await readFile(join(generated, "canvas.ts"), "utf8");
    expect(canvas).toContain('"code:testimonial": () =>');
    expect(canvas).toContain('"default": {\n  },');
    expect(canvas).not.toContain("components/Site");

    const href =
      /"code": \{\s+stylesheet: "(\/_templates\/code\/[0-9a-f]{12}\/styles\/main\.css)"/.exec(
        site,
      )?.[1];
    expect(href).toBeDefined();
    const served = join(generated, "public", ...(href ?? "").split("/").filter(Boolean));
    expect(await readFile(served, "utf8")).toContain(".code-site");

    // A changed stylesheet gets a new folder, and the old one goes.
    const [code] = report.checked.filter((c) => c.entry.slug === "code");
    if (!code?.styles) throw new Error("fixture");
    await writeGenerated(root, [
      ...report.checked.filter((c) => c !== code),
      {
        ...code,
        styles: {
          ...code.styles,
          css: `${code.styles.css}
.code-site { gap: 0; }`,
        },
      },
    ]);
    const folders = await readdir(join(generated, "public", "_templates", "code"));
    expect(folders).toHaveLength(1);
    expect(href).not.toContain(folders[0]);
    // Two whole templates checked, rendered included: slower than the default limit allows when
    // every package's tests run at once.
  }, 30_000);

  test("fails when the default template lacks a layout the others fall back to", async () => {
    const { root } = await repo();
    const report = await checkInstalled(root, context, { allowLocal: false });
    await expect(writeGenerated(root, report.checked)).rejects.toThrow(
      "The default template has no site, page, post, archive, notFound layout",
    );
  });
});
