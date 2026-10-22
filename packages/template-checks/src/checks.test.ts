// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BlockListResult } from "@sitebuilder/schema";
import { afterEach, describe, expect, test } from "vitest";
import { type CheckContext, runChecks } from "./index";

// One good fixture on disk; each bad case is a copy with one thing broken, and must fail with
// its own rule and no other (docs/templates_and_ai_design.md A5).

const GOOD = join(import.meta.dirname, "..", "fixtures", "good");

// The real check lives in @sitebuilder/blocks; this one accepts headings with text only.
function validateContent(input: unknown): BlockListResult {
  const blocks = input as { type: string; props: Record<string, unknown> }[];
  const bad = blocks.findIndex(
    (block) => block.type !== "heading" || typeof block.props.text !== "string",
  );
  return bad === -1
    ? { ok: true, value: blocks as never }
    : {
        ok: false,
        issues: [{ path: [bad, "type"], code: "unknown-type", message: "Not a heading" }],
      };
}

const context: CheckContext = {
  sitebuilderVersion: "0.1.0",
  nuvuiVersion: "0.8.0",
  validateContent,
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// A copy of the good fixture in a folder named `slug`, changed by `change`.
async function fixture(change: (dir: string) => Promise<void>, slug = "good"): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "template-checks-"));
  dirs.push(parent);
  const dir = join(parent, slug);
  await cp(GOOD, dir, { recursive: true });
  await change(dir);
  return dir;
}

async function editJson(dir: string, file: string, edit: (json: Record<string, unknown>) => void) {
  const path = join(dir, file);
  const json = JSON.parse(await readFile(path, "utf8"));
  edit(json);
  await writeFile(path, JSON.stringify(json));
}

const rulesOf = async (dir: string) => [
  ...new Set((await runChecks(dir, context)).findings.map((f) => f.rule)),
];

describe("runChecks", () => {
  test("the good fixture passes, and comes back parsed", async () => {
    const report = await runChecks(GOOD, context);
    expect(report.findings).toEqual([]);
    expect(report.manifest?.slug).toBe("good");
    expect(report.starter?.homeRef).toBe("home");
  });

  test.each<[string, string, (dir: string) => Promise<void>]>([
    [
      "TPL-MANIFEST-001",
      "an unknown key",
      (dir) =>
        editJson(dir, "template.json", (j) => {
          j.scripts = {};
        }),
    ],
    [
      "TPL-MANIFEST-001",
      "JSON that doesn't parse",
      (dir) => writeFile(join(dir, "template.json"), "{"),
    ],
    [
      "TPL-MANIFEST-002",
      "a screenshot that isn't there",
      (dir) => rm(join(dir, "screenshots", "home.png")),
    ],
    [
      "TPL-MANIFEST-003",
      "a Sitebuilder it doesn't run on",
      (dir) =>
        editJson(dir, "template.json", (j) => {
          j.requires = { sitebuilder: "^1.0.0", nuvui: "^0.8.0" };
        }),
    ],
    ["TPL-MANIFEST-004", "no LICENSE", (dir) => rm(join(dir, "LICENSE"))],
    [
      "TPL-MANIFEST-005",
      "a 7B key",
      (dir) =>
        editJson(dir, "template.json", (j) => {
          j.components = {};
        }),
    ],
    [
      "TPL-FILES-001",
      "a file type that isn't allowed",
      (dir) => writeFile(join(dir, "run.sh"), "echo"),
    ],
    ["TPL-FILES-002", "a dotfile", (dir) => writeFile(join(dir, ".env"), "X=1")],
    ["TPL-FILES-002", "a package.json", (dir) => writeFile(join(dir, "package.json"), "{}")],
    [
      "TPL-FILES-003",
      "an image over 500 KiB",
      (dir) => writeFile(join(dir, "screenshots", "home.png"), Buffer.alloc(501 * 1024)),
    ],
    [
      "TPL-CSS-005",
      "a token value that isn't plain CSS",
      (dir) =>
        editJson(dir, "template.json", (j) => {
          j.theme = {
            preset: "ember",
            mode: "system",
            density: "default",
            tokens: { "--color-primary": { light: "url(x)" } },
          };
        }),
    ],
    [
      "TPL-CONTENT-001",
      "a starter that doesn't parse",
      (dir) =>
        editJson(dir, "content/starter.json", (j) => {
          j.pages = [];
        }),
    ],
    [
      "TPL-CONTENT-001",
      "a link to a starter page that doesn't exist",
      (dir) =>
        editJson(dir, "content/starter.json", (j) => {
          j.homeRef = "gone";
        }),
    ],
    [
      "TPL-CONTENT-001",
      "a block the content check refuses",
      (dir) =>
        editJson(dir, "content/starter.json", (j) => {
          (j.pages as { content: unknown[] }[])[1]?.content.push({ type: "video", props: {} });
        }),
    ],
    [
      "TPL-CONTENT-002",
      "a media id",
      (dir) =>
        editJson(dir, "content/starter.json", (j) => {
          (j.pages as { content: unknown[] }[])[1]?.content.push({
            type: "heading",
            props: { text: "x", imageMediaId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70" },
          });
        }),
    ],
  ])("%s: %s", async (rule, _, change) => {
    expect(await rulesOf(await fixture(change))).toEqual([rule]);
  });

  test("TPL-MANIFEST-002: a slug that isn't the folder's name", async () => {
    expect(await rulesOf(await fixture(async () => {}, "other"))).toEqual(["TPL-MANIFEST-002"]);
  });

  test("TPL-FILES-003: more than 300 files", async () => {
    const dir = await fixture(async (d) => {
      await mkdir(join(d, "many"));
      await Promise.all(
        Array.from({ length: 300 }, (_, i) => writeFile(join(d, "many", `${i}.md`), "")),
      );
    });
    expect(await rulesOf(dir)).toEqual(["TPL-FILES-003"]);
  });

  test.skipIf(process.platform === "win32")("TPL-FILES-002: a symbolic link", async () => {
    const dir = await fixture((d) => symlink("/etc/hosts", join(d, "hosts.md")));
    expect(await rulesOf(dir)).toEqual(["TPL-FILES-002"]);
  });

  test.skipIf(process.platform === "win32")(
    "TPL-FILES-002: a script, but not a file merely marked executable",
    async () => {
      const dir = await fixture(async (d) => {
        await writeFile(join(d, "run.md"), "#!/bin/sh\necho hi\n");
        await chmod(join(d, "run.md"), 0o755);
        // What a Docker context from Windows does to every file.
        await chmod(join(d, "template.json"), 0o755);
      });
      expect((await runChecks(dir, context)).findings.map((f) => [f.rule, f.file])).toEqual([
        ["TPL-FILES-002", "run.md"],
      ]);
    },
  );
});
