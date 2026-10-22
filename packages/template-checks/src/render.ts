// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAYOUT_NAMES, optionValues, type TemplateManifest } from "@sitebuilder/schema";
import { build } from "esbuild";
import type { CodeContext } from "./code";
import type { Finding } from "./index";

// TPL-RENDER-001 and -002 (docs/templates_and_ai_design.md A5): every layout renders with sample
// data, and every block with its defaults, without throwing. A server render in Node, not a
// browser: it proves the code runs, not how it looks.
//
// Template code runs only after every static rule passed, and never in this process: the static
// rules are names to refuse, which a determined author can get round (decisions #115). The
// template, React and nuvui are bundled into one file that a child process runs under Node's
// permission model (it may read that file and nothing else, start no process or worker, and
// load no addon), with code generation from strings turned off, an empty environment, a
// temporary working folder, 512 MB of memory and a time limit.

export interface RenderContext extends CodeContext {
  // A template block's defaults, parsed by the schema built from its fields (the CLI passes
  // templateBlockSchema from @sitebuilder/blocks); a message when they don't pass.
  blockDefaults?: (
    manifest: TemplateManifest,
    name: string,
  ) => { ok: true; props: Record<string, unknown> } | { ok: false; message: string };
}

// next/link and next/image need Next's runtime; here they're a plain link and picture.
const NEXT_STUBS: Record<string, string> = {
  "next/link":
    'import { createElement } from "react"; export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return createElement("a", { href: String(href), ...rest }, children); }',
  "next/image":
    'import { createElement } from "react"; export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) { return createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }); }',
};

const SITE = {
  title: "Sample site",
  tagline: "A line about it",
  language: "en",
  url: "https://example.test",
};
const DAY = { iso: "2026-10-22T09:00:00.000Z", text: "22/10/2026" };
const MENU = [
  { id: "m1", label: "Home", href: "/", openInNewTab: false, children: [] },
  {
    id: "m2",
    label: "About",
    href: null,
    openInNewTab: false,
    children: [{ id: "m3", label: "Team", href: "/about/team", openInNewTab: true, children: [] }],
  },
];
const PICTURE = { src: "/media/2026/10/sample.jpg", width: 1200, height: 800, alt: "A sample" };
const ENTRY = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "page",
  title: "A sample page",
  path: "/sample",
  excerpt: "A sentence about it.",
  published: DAY,
  updated: DAY,
  authorName: "Sam Ple",
  featured: null,
  seoTitle: null,
  seoDescription: null,
};

// The child's answer, on a line of its own after this marker (with a random part, so nothing the
// template prints is mistaken for it).
const MARKER = "SITEBUILDER-RENDER-RESULT";
const TIME_LIMIT_MS = 30_000;

interface Job {
  key: string;
  kind: "layout" | "block";
  props: Record<string, unknown>;
}

// Runs in the child: draws each job and prints what threw. `children` and the block's lookups
// are added there, since they can't cross as JSON.
const RUNNER = `
const results = [];
for (const job of jobs) {
  try {
    const component = components[job.key];
    if (component == null) throw new Error("It has no default export to draw");
    const props = job.kind === "layout"
      ? { ...job.props, children: createElement("p", null, "The page's blocks") }
      : { props: job.props, media: (id) => ({ ...picture, id, mimeType: "image/jpeg" }), href: () => "/", editing: false };
    renderToStaticMarkup(createElement(component, props));
    results.push({ key: job.key });
  } catch (error) {
    results.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
  }
}
process.stdout.write("\\n" + marker + JSON.stringify(results) + "\\n");
`;

function sampleProps(name: string, manifest: TemplateManifest): Record<string, unknown> {
  const options = optionValues(manifest.options ?? [], {});
  switch (name) {
    case "site":
      return {
        site: SITE,
        menus: { primary: MENU, footer: MENU },
        currentPath: "/",
        options,
      };
    case "page":
      return { site: SITE, entry: ENTRY, titleInContent: false, options };
    case "post":
      return {
        site: SITE,
        entry: { ...ENTRY, type: "post", path: "/blog/sample", featured: PICTURE },
        titleInContent: false,
        options,
        terms: [{ taxonomy: "category", name: "News", href: "/blog/category/news" }],
        readingProgress: true,
      };
    case "archive":
      return {
        site: SITE,
        kind: "posts",
        title: "Blog",
        description: null,
        options,
        posts: [
          {
            id: "p1",
            title: "First",
            path: "/blog/first",
            excerpt: "One.",
            published: DAY,
            image: PICTURE,
          },
          {
            id: "p2",
            title: "Second",
            path: "/blog/second",
            excerpt: null,
            published: null,
            image: null,
          },
        ],
        pagination: {
          page: 1,
          pages: 2,
          previous: null,
          next: "/blog/page/2",
          links: [
            { page: 1, href: "/blog" },
            { page: 2, href: "/blog/page/2" },
          ],
        },
      };
    default:
      return { site: SITE, options };
  }
}

function run(outfile: string, out: string): Promise<{ stdout: string; failure: string | null }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${out}`,
        "--disallow-code-generation-from-strings",
        "--max-old-space-size=512",
        outfile,
      ],
      { cwd: out, env: {}, timeout: TIME_LIMIT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        const failure = error
          ? error.killed
            ? `It didn't finish within ${TIME_LIMIT_MS / 1000} seconds`
            : (error.message.split("\n").find((line) => /Error/.test(line)) ?? error.message)
          : null;
        resolve({ stdout: String(stdout), failure });
      },
    );
  });
}

export async function renderRules(
  dir: string,
  manifest: TemplateManifest,
  context: RenderContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const layouts = LAYOUT_NAMES.flatMap((name) => {
    const file = manifest.components?.[name];
    return file ? [{ name, file }] : [];
  });
  const declared = manifest.blocks ?? [];
  if (layouts.length === 0 && declared.length === 0) return findings;

  // Block defaults are data: checked here, before any code runs.
  const blocks: { name: string; file: string; props: Record<string, unknown> }[] = [];
  for (const block of declared) {
    const defaults = context.blockDefaults?.(manifest, block.name) ?? {
      ok: true,
      props: block.defaults,
    };
    if (!defaults.ok) {
      findings.push({
        rule: "TPL-RENDER-002",
        severity: "error",
        file: "template.json",
        message: `${block.name}: its defaults don't pass its fields: ${defaults.message}`,
      });
    } else {
      blocks.push({ name: block.name, file: block.component, props: defaults.props });
    }
  }

  const jobs: Job[] = [
    ...layouts.map(
      (layout): Job => ({
        key: `layout:${layout.name}`,
        kind: "layout",
        props: sampleProps(layout.name, manifest),
      }),
    ),
    ...blocks.map(
      (block): Job => ({ key: `block:${block.name}`, kind: "block", props: block.props }),
    ),
  ];
  const owners = new Map<string, { rule: string; file: string }>([
    ...layouts.map((layout): [string, { rule: string; file: string }] => [
      `layout:${layout.name}`,
      { rule: "TPL-RENDER-001", file: layout.file },
    ]),
    ...blocks.map((block): [string, { rule: string; file: string }] => [
      `block:${block.name}`,
      { rule: "TPL-RENDER-002", file: block.file },
    ]),
  ]);
  const marker = `${MARKER}-${randomUUID()}:`;
  const entry = [
    'import { createElement } from "react";',
    'import { renderToStaticMarkup } from "react-dom/server";',
    ...layouts.map((layout, i) => `import L${i} from ${JSON.stringify(join(dir, layout.file))};`),
    ...blocks.map((block, i) => `import B${i} from ${JSON.stringify(join(dir, block.file))};`),
    `const components = { ${[
      ...layouts.map((layout, i) => `${JSON.stringify(`layout:${layout.name}`)}: L${i}`),
      ...blocks.map((block, i) => `${JSON.stringify(`block:${block.name}`)}: B${i}`),
    ].join(", ")} };`,
    `const jobs = ${JSON.stringify(jobs)};`,
    `const picture = ${JSON.stringify(PICTURE)};`,
    `const marker = ${JSON.stringify(marker)};`,
    RUNNER,
  ].join("\n");

  const out = await mkdtemp(join(tmpdir(), "sitebuilder-render-"));
  try {
    const outfile = join(out, "template.cjs");
    try {
      await build({
        stdin: { contents: entry, resolveDir: context.resolveDir, loader: "tsx" },
        bundle: true,
        platform: "node",
        format: "cjs",
        jsx: "automatic",
        outfile,
        nodePaths: [join(context.resolveDir, "node_modules")],
        logLevel: "silent",
        logOverride: { "module-level-directive": "silent" },
        plugins: [
          {
            name: "next-stubs",
            setup(builder) {
              builder.onResolve({ filter: /^next\/(link|image)$/ }, (args) => ({
                path: args.path,
                namespace: "next-stub",
              }));
              builder.onLoad({ filter: /.*/, namespace: "next-stub" }, (args) => ({
                contents: NEXT_STUBS[args.path] ?? "",
                loader: "js",
                resolveDir: context.resolveDir,
              }));
            },
          },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      findings.push({
        rule: "TPL-RENDER-001",
        severity: "error",
        file: ".",
        message: `It doesn't build: ${message}`,
      });
      return findings;
    }

    const { stdout, failure } = await run(outfile, out);
    const line = stdout
      .split(/\r?\n/)
      .reverse()
      .find((candidate) => candidate.startsWith(marker));
    let results: { key: string; error?: string }[] | null = null;
    try {
      results = line ? JSON.parse(line.slice(marker.length)) : null;
    } catch {
      results = null;
    }
    if (!results) {
      findings.push({
        rule: "TPL-RENDER-001",
        severity: "error",
        file: ".",
        message: `It didn't render: ${failure ?? "no result came back"}`,
      });
      return findings;
    }
    for (const result of results) {
      const owner = owners.get(result.key);
      if (!owner || result.error === undefined) continue;
      findings.push({
        rule: owner.rule,
        severity: "error",
        file: owner.file,
        message:
          owner.rule === "TPL-RENDER-001"
            ? `It throws with sample data: ${result.error}`
            : `It throws with its defaults: ${result.error}`,
      });
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  return findings;
}
