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
const CODE = join(import.meta.dirname, "..", "fixtures", "code");

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
  // Where a template's imports resolve, as the CLI passes it: templates/ depends on React, nuvui,
  // Next and the SDK.
  resolveDir: join(import.meta.dirname, "..", "..", "..", "templates"),
  nuvuiPackages: ["@nuvui/react", "@nuvui/icons", "@nuvui/backgrounds", "@nuvui/media"],
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// A copy of a fixture in a folder named `slug`, changed by `change`.
async function fixture(
  change: (dir: string) => Promise<void>,
  slug = "good",
  from = GOOD,
): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "template-checks-"));
  dirs.push(parent);
  const dir = join(parent, slug);
  await cp(from, dir, { recursive: true });
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
      "TPL-MANIFEST-002",
      "a layout that isn't in the folder",
      (dir) =>
        editJson(dir, "template.json", (j) => {
          j.components = { site: "components/Site.tsx", page: "components/Page.tsx" };
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

describe("the code rules", () => {
  const PAGE = "components/Page.tsx";
  const BLOCK = "components/blocks/Testimonial.tsx";

  // The code fixture with `body` in place of the page layout's JSX, or `source` as a whole file.
  const page =
    (body: string, head = "") =>
    async (dir: string) =>
      writeFile(
        join(dir, PAGE),
        `${head}\nimport type { PageLayoutProps } from "@sitebuilder/template-sdk";\nexport default function Page({ entry, children }: PageLayoutProps) {\n  return (${body});\n}\n`,
      );
  const findingsOf = async (change: (dir: string) => Promise<void>) =>
    (await runChecks(await fixture(change, "code", CODE), context)).findings;

  test("the code fixture passes, a local named fetch included", async () => {
    const report = await runChecks(await fixture(async () => {}, "code", CODE), context);
    expect(report.findings).toEqual([]);
  });

  test.each<[string, string, (dir: string) => Promise<void>]>([
    [
      "TPL-IMPORT-001",
      "an import that isn't allowed",
      page("<p>{entry.title}</p>", 'import { headers } from "next/headers";\nvoid headers;'),
    ],
    [
      "TPL-IMPORT-001",
      "a relative import out of the folder",
      page("<p>{entry.title}</p>", 'import "../../outside";'),
    ],
    ["TPL-API-001", "the global fetch", page("<p>{String(fetch)}</p>")],
    ["TPL-API-001", "window.fetch", page("<p>{String(window.fetch)}</p>")],
    ["TPL-API-001", "a dynamic import", page('<p>{String(import("./nav"))}</p>')],
    [
      "TPL-API-001",
      "reaching Function through .constructor",
      page("<p>{String((() => 0).constructor)}</p>"),
    ],
    ["TPL-API-001", "Reflect", page("<p>{String(Reflect.ownKeys(entry))}</p>")],
    [
      "TPL-API-002",
      "dangerouslySetInnerHTML",
      page("<div dangerouslySetInnerHTML={{ __html: entry.title }} />"),
    ],
    ["TPL-API-003", '"use server"', page("<p>{entry.title}</p>", '"use server";')],
    ["TPL-API-004", "a form", page('<form action="/">{children}</form>')],
    [
      "TPL-API-005",
      "a picture from another site",
      page('<img src="https://example.com/a.png" alt="" />'),
    ],
    [
      "TPL-API-006",
      "an outside link without rel",
      page('<a href="https://example.com">{entry.title}</a>'),
    ],
    ["TPL-OBF-001", "a minified line", page(`<p title="${"word ".repeat(110)}">{entry.title}</p>`)],
    [
      "TPL-OBF-002",
      "a long encoded string",
      page(`<p data-x="${"ab12".repeat(60)}">{entry.title}</p>`),
    ],
    ["TPL-OBF-003", "window[x]", page('<p>{String(window["loc" + "ation"])}</p>')],
    ["TPL-NUVUI-001", "a browser button", page('<button type="button">{entry.title}</button>')],
    [
      "TPL-NUVUI-002",
      "a name nuvui doesn't export",
      page("<Nope />", 'import { Nope } from "@nuvui/react";'),
    ],
    [
      "TPL-NUVUI-002",
      "a nuvui package the site doesn't load",
      page("<p>{entry.title}</p>", 'import "@nuvui/editor";'),
    ],
    ["TPL-TYPES-001", "a type error", page("<p>{entry.title.toFixed(2)}</p>")],
    [
      "TPL-TYPES-001",
      "a layout that doesn't fit its slot",
      (dir) =>
        writeFile(
          join(dir, PAGE),
          "export default function Page({ extra }: { extra: number }) {\n  return <p>{extra}</p>;\n}\n",
        ),
    ],
    [
      "TPL-TYPES-001",
      "a block that wants a prop its fields don't give",
      (dir) =>
        writeFile(
          join(dir, BLOCK),
          'import { defineBlock } from "@sitebuilder/template-sdk";\nexport default defineBlock<{ quote: string; rating: number }>(({ props }) => <p>{props.rating}</p>);\n',
        ),
    ],
  ])("%s: %s", async (rule, _, change) => {
    const findings = await findingsOf(change);
    expect(
      findings.map((f) => f.rule),
      JSON.stringify(findings),
    ).toEqual([rule]);
  });

  test("findings name the file and line", async () => {
    const [finding] = await findingsOf(page("<p>{String(fetch)}</p>"));
    expect(finding).toMatchObject({ file: PAGE, line: 4 });
  });
});

describe("the stylesheet rules", () => {
  const style = (css: string) => (dir: string) => writeFile(join(dir, "styles", "main.scss"), css);
  const findingsOf = async (change: (dir: string) => Promise<void>) =>
    (await runChecks(await fixture(change, "code", CODE), context)).findings;

  test.each<[string, string, string]>([
    [
      "TPL-CSS-001",
      "a picture from another site",
      ".a { background: url(https://example.com/x.png); }",
    ],
    ["TPL-CSS-001", "an @import", '@import url("https://example.com/x.css");'],
    ["TPL-CSS-001", "a file outside the folder", ".a { background: url(../../x.png); }"],
    [
      "TPL-CSS-002",
      "a remote font",
      "@font-face { font-family: X; src: url(https://fonts.example.com/x.woff2); }",
    ],
    ["TPL-CSS-003", "-moz-binding", ".a { -moz-binding: none; }"],
    ["TPL-CSS-004", "a nuvui class", ".nuv-button { inline-size: 100%; }"],
    ["TPL-CSS-005", "a theme token on :root", ":root { --color-primary: blue; }"],
    ["TPL-CSS-005", "a token value that isn't one", '.a { --radius-md: "big"; }'],
    ["TPL-TYPES-001", "SCSS that doesn't compile", ".a { color: $missing; }"],
  ])("%s: %s", async (rule, _, css) => {
    const findings = await findingsOf(style(css));
    expect(
      findings.map((f) => f.rule),
      JSON.stringify(findings),
    ).toEqual([rule]);
  });

  test("a colour written out is a warning, not an error", async () => {
    const findings = await findingsOf(style(".a { color: #ff0000; }"));
    expect(findings).toEqual([expect.objectContaining({ rule: "TPL-CSS-006", severity: "warn" })]);
  });

  test("nuvui's SCSS resolves from templates/, and the stylesheet comes back compiled", async () => {
    const dir = await fixture(
      style(
        '@use "@nuvui/react/scss/mixins" as nuv;\n.a { @include nuv.breakpoint("md") { display: grid; } }',
      ),
      "code",
      CODE,
    );
    const report = await runChecks(dir, context);
    expect(report.findings).toEqual([]);
    expect(report.styles?.css).toContain("display: grid");
  });
});

describe("the render rules", () => {
  const findingsOf = async (
    change: (dir: string) => Promise<void>,
    extra: Partial<CheckContext> = {},
  ) => (await runChecks(await fixture(change, "code", CODE), { ...context, ...extra })).findings;

  test("TPL-RENDER-001: a layout that throws with sample data", async () => {
    const findings = await findingsOf((dir) =>
      writeFile(
        join(dir, "components", "Page.tsx"),
        'import type { PageLayoutProps } from "@sitebuilder/template-sdk";\nexport default function Page({ entry }: PageLayoutProps) {\n  if (entry.title) throw new Error("boom");\n  return <p />;\n}\n',
      ),
    );
    expect(findings).toEqual([
      expect.objectContaining({ rule: "TPL-RENDER-001", file: "components/Page.tsx" }),
    ]);
    expect(findings[0]?.message).toContain("boom");
  });

  test("TPL-RENDER-002: a block that throws with its defaults", async () => {
    const findings = await findingsOf((dir) =>
      writeFile(
        join(dir, "components", "blocks", "Testimonial.tsx"),
        'import { defineBlock } from "@sitebuilder/template-sdk";\nexport default defineBlock<{ quote: string }>(({ props }) => {\n  if (props.quote) throw new Error("no quotes");\n  return <p />;\n});\n',
      ),
    );
    expect(findings.map((f) => f.rule)).toEqual(["TPL-RENDER-002"]);
  });

  test("TPL-RENDER-002: defaults that don't pass the block's fields", async () => {
    const findings = await findingsOf(async () => {}, {
      blockDefaults: () => ({ ok: false, message: "quote: Write something here" }),
    });
    expect(findings).toEqual([
      expect.objectContaining({ rule: "TPL-RENDER-002", file: "template.json" }),
    ]);
  });

  // A determined template can get past the names the static rules refuse; the render then runs
  // where it can read nothing but its own bundle and sees no environment (decisions #115).
  test("the render is sandboxed: no secrets from the environment, and no files", async () => {
    // Windows always hands a child its system folders and user name; a secret never arrives.
    process.env.SITEBUILDER_TEST_SECRET = "secret";
    const outside = join(import.meta.dirname, "..", "package.json").replaceAll("\\", "/");
    const findings = await findingsOf((dir) =>
      writeFile(
        join(dir, "components", "Page.tsx"),
        'import type { PageLayoutProps } from "@sitebuilder/template-sdk";\nconst host = globalThis as unknown as { process: { env: Record<string, string>; getBuiltinModule(name: string): { readFileSync(path: string, encoding: string): string } } };\nexport default function Page({ entry }: PageLayoutProps) {\n  if (host.process.env.SITEBUILDER_TEST_SECRET) throw new Error("saw the environment");\n  const text = host.process.getBuiltinModule("fs").readFileSync(' +
          JSON.stringify(outside) +
          ', "utf8");\n  return <p>{entry.title + text.length}</p>;\n}\n',
      ),
    );
    expect(
      findings.map((f) => f.rule),
      JSON.stringify(findings),
    ).toEqual(["TPL-RENDER-001"]);
    expect(findings[0]?.message).not.toContain("saw the environment");
    expect(findings[0]?.message).toMatch(/access|permission|restricted/i);
    delete process.env.SITEBUILDER_TEST_SECRET;
  });

  test("code that breaks a static rule is never run", async () => {
    const findings = await findingsOf((dir) =>
      writeFile(
        join(dir, "components", "Page.tsx"),
        'import type { PageLayoutProps } from "@sitebuilder/template-sdk";\nexport default function Page({ entry }: PageLayoutProps) {\n  if (entry.title) throw new Error(String(fetch));\n  return <p />;\n}\n',
      ),
    );
    expect(
      findings.map((f) => f.rule),
      JSON.stringify(findings),
    ).toEqual(["TPL-API-001"]);
  });
});
