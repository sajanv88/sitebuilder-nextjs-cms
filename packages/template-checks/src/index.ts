// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { readFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import {
  type BlockListResult,
  type ContentIssue,
  resolveRefs,
  type StarterContent,
  StarterContentSchema,
  satisfiesRange,
  starterIssues,
  type TemplateManifest,
  TemplateManifestSchema,
  withBlockIds,
} from "@sitebuilder/schema";
import * as v from "valibot";
import { codeRules } from "./code";
import { listFiles, type TemplateFile } from "./files";
import { type RenderContext, renderRules } from "./render";
import { type CompiledStyles, styleRules } from "./styles";

// The rules a template folder must pass (docs/templates_and_ai_design.md A5), run by the CLI at
// build time and by `template verify`: the data rules here, the code rules in code.ts. Each
// finding names its rule, so a fixture can show it fails with that rule and no other.

export interface Finding {
  rule: string;
  severity: "error" | "warn";
  // A path inside the template folder.
  file: string;
  line?: number;
  message: string;
}

export interface CheckContext extends RenderContext {
  sitebuilderVersion: string;
  nuvuiVersion: string;
  // The content check every write goes through (validateContent from @sitebuilder/blocks), with
  // the template's own blocks known to it. Passed in, so this package depends on neither the
  // blocks nor an app.
  validateContent: (input: unknown, manifest: TemplateManifest) => BlockListResult;
  // The icons a template block may name (FEATURE_ICON_NAMES from @sitebuilder/blocks).
  blockIcons?: readonly string[];
}

export interface CheckReport {
  findings: Finding[];
  // Set when template.json parsed; the starter content when it parsed and passed.
  manifest: TemplateManifest | null;
  starter: StarterContent | null;
  // The stylesheet as it ships, when there is one and it compiled.
  styles: CompiledStyles | null;
}

const KiB = 1024;
const LIMITS = {
  files: 300,
  total: 2 * KiB * KiB,
  source: 100 * KiB,
  image: 500 * KiB,
  font: 300 * KiB,
};
const SOURCE = [".json", ".ts", ".tsx", ".css", ".scss", ".md"];
const IMAGE = [".png", ".jpg", ".webp", ".avif"];
const FONT = [".woff2"];
const LICENCE_FILES = ["LICENSE", "LICENSE.md"];
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];

const extension = (file: string) => posix.extname(file).toLowerCase();

function fileRules(files: readonly TemplateFile[]): Finding[] {
  const findings: Finding[] = [];
  const refused = new Set<string>();
  const error = (rule: string, file: string, message: string) =>
    findings.push({ rule, severity: "error", file, message });

  for (const file of files) {
    const segments = file.path.split("/");
    const name = basename(file.path);
    let reason: string | null = null;
    if (file.symlink) reason = "is a symbolic link";
    else if (file.executable) reason = "is executable";
    else if (segments.some((segment) => segment.startsWith("."))) reason = "is a dotfile";
    else if (segments.includes("node_modules")) reason = "is inside node_modules";
    else if (name === "package.json") reason = "is a package.json: templates have no dependencies";
    else if (LOCKFILES.includes(name)) reason = "is a lockfile: templates have no dependencies";
    if (reason) {
      refused.add(file.path);
      error("TPL-FILES-002", file.path, `${file.path} ${reason}`);
    }
  }

  for (const file of files) {
    if (refused.has(file.path) || LICENCE_FILES.includes(file.path)) continue;
    const ext = extension(file.path);
    if (![...SOURCE, ...IMAGE, ...FONT].includes(ext)) {
      error(
        "TPL-FILES-001",
        file.path,
        `${ext || "A file without an extension"} isn't allowed in a template`,
      );
    }
  }

  if (files.length > LIMITS.files) {
    error("TPL-FILES-003", ".", `${files.length} files, more than ${LIMITS.files}`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > LIMITS.total) error("TPL-FILES-003", ".", `${total} bytes in all, more than 2 MiB`);
  for (const file of files) {
    const ext = extension(file.path);
    const limit = IMAGE.includes(ext)
      ? LIMITS.image
      : FONT.includes(ext)
        ? LIMITS.font
        : LIMITS.source;
    if (file.size > limit) {
      error(
        "TPL-FILES-003",
        file.path,
        `${file.size} bytes, more than ${limit / KiB} KiB for this kind of file`,
      );
    }
  }
  return findings;
}

async function readJson(
  dir: string,
  file: string,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(join(dir, file), "utf8")) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof SyntaxError ? `Not valid JSON: ${error.message}` : "Can't be read",
    };
  }
}

const dotted = (path: readonly (string | number | undefined)[]) =>
  path.filter((part) => part !== undefined).join(".");

function issuePath(issue: v.BaseIssue<unknown>): (string | number)[] {
  return (issue.path ?? []).map((item) =>
    typeof item.key === "number" ? item.key : String(item.key),
  );
}

async function manifestRules(
  dir: string,
  files: readonly TemplateFile[],
  context: CheckContext,
): Promise<{ findings: Finding[]; manifest: TemplateManifest | null }> {
  const findings: Finding[] = [];
  const error = (rule: string, message: string, file = "template.json") =>
    findings.push({ rule, severity: "error", file, message });

  if (!files.some((file) => file.path === "template.json")) {
    error("TPL-MANIFEST-001", "There's no template.json");
    return { findings, manifest: null };
  }
  const json = await readJson(dir, "template.json");
  if (!json.ok) {
    error("TPL-MANIFEST-001", json.message);
    return { findings, manifest: null };
  }
  const parsed = v.safeParse(TemplateManifestSchema, json.value);
  if (!parsed.success) {
    for (const issue of parsed.issues) {
      const path = issuePath(issue);
      // A theme token's name or value: the same rule template CSS follows in 7B.
      const rule = path[0] === "theme" && path[1] === "tokens" ? "TPL-CSS-005" : "TPL-MANIFEST-001";
      error(rule, `${dotted(path) || "template.json"}: ${issue.message}`);
    }
    return { findings, manifest: null };
  }
  const manifest = parsed.output;

  if (manifest.slug !== basename(dir)) {
    error(
      "TPL-MANIFEST-002",
      `The slug "${manifest.slug}" isn't the folder's name, "${basename(dir)}"`,
    );
  }
  const present = new Set(files.map((file) => file.path));
  const referenced = [
    ...manifest.screenshots.map((shot) => shot.file),
    ...(manifest.starter ? [manifest.starter] : []),
    ...Object.values(manifest.components ?? {}).filter((file) => file !== undefined),
    ...(manifest.styles ? [manifest.styles.entry] : []),
    ...(manifest.blocks ?? []).map((block) => block.component),
  ];
  for (const file of referenced) {
    if (!present.has(file))
      error("TPL-MANIFEST-002", `${file} is named in template.json but isn't in the folder`);
  }
  for (const [name, range, running] of [
    ["Sitebuilder", manifest.requires.sitebuilder, context.sitebuilderVersion],
    ["nuvui", manifest.requires.nuvui, context.nuvuiVersion],
  ] as const) {
    if (!satisfiesRange(running, range)) {
      error("TPL-MANIFEST-003", `It needs ${name} ${range}; this site has ${running}`);
    }
  }
  if (!LICENCE_FILES.some((file) => present.has(file))) {
    error("TPL-MANIFEST-004", "There's no LICENSE file", "LICENSE");
  }
  for (const block of manifest.blocks ?? []) {
    if (context.blockIcons && !context.blockIcons.includes(block.icon)) {
      error(
        "TPL-MANIFEST-001",
        `blocks.${block.name}.icon: "${block.icon}" isn't one of the icons blocks use`,
      );
    }
  }
  return { findings, manifest };
}

// Media props follow one naming rule (A9): mediaId, mediaIds, or a name ending in MediaId.
function isMediaKey(key: string): boolean {
  return key === "mediaId" || key === "mediaIds" || key.endsWith("MediaId");
}

function mediaPaths(value: unknown, path: (string | number)[], out: (string | number)[][]): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) mediaPaths(item, [...path, index], out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const empty =
        item === undefined ||
        item === null ||
        item === "" ||
        (Array.isArray(item) && item.length === 0);
      if (isMediaKey(key) && !empty) out.push([...path, key]);
      else mediaPaths(item, [...path, key], out);
    }
  }
}

// Ids for checking only: the import makes its own.
const fakeUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function contentRules(
  file: string,
  json: unknown,
  manifest: TemplateManifest,
  context: CheckContext,
): { findings: Finding[]; starter: StarterContent | null } {
  const findings: Finding[] = [];
  const error = (rule: string, message: string) =>
    findings.push({ rule, severity: "error", file, message });
  const report = (issues: readonly ContentIssue[], prefix: (string | number)[] = []) => {
    for (const issue of issues)
      error("TPL-CONTENT-001", `${dotted([...prefix, ...issue.path])}: ${issue.message}`);
  };

  const parsed = v.safeParse(StarterContentSchema, json);
  if (!parsed.success) {
    for (const issue of parsed.issues)
      error("TPL-CONTENT-001", `${dotted(issuePath(issue))}: ${issue.message}`);
    return { findings, starter: null };
  }
  const starter = parsed.output;

  const media: (string | number)[][] = [];
  mediaPaths(starter, [], media);
  for (const path of media) {
    error(
      "TPL-CONTENT-002",
      `${dotted(path)}: starter content can't use media; the import has none to point at`,
    );
  }

  report(starterIssues(starter));
  const ids = new Map<string, string>();
  for (const [index, entry] of [...starter.pages, ...starter.posts].entries()) {
    ids.set(entry.ref, fakeUuid(index + 1));
  }
  let n = 0;
  const makeId = () => `check-${String(++n).padStart(6, "0")}`;
  for (const [kind, list] of [
    ["pages", starter.pages],
    ["posts", starter.posts],
  ] as const) {
    list.forEach((entry, index) => {
      const blocks = withBlockIds(entry.content, makeId);
      // Unknown refs are reported by starterIssues; here they're only resolved.
      const resolved = resolveRefs(blocks, ids).value;
      const result = media.length > 0 ? null : context.validateContent(resolved, manifest);
      if (result && !result.ok) report(result.issues, [kind, index, "content"]);
    });
  }
  return { findings, starter: findings.length === 0 ? starter : null };
}

export async function runChecks(dir: string, context: CheckContext): Promise<CheckReport> {
  const files = await listFiles(dir);
  const findings = fileRules(files);
  const { findings: manifestFindings, manifest } = await manifestRules(dir, files, context);
  findings.push(...manifestFindings);

  let styles: CompiledStyles | null = null;
  if (manifest) {
    const sources = files.filter((file) => !file.symlink).map((file) => file.path);
    findings.push(...(await codeRules(dir, sources, manifest, context)));
    const entry = manifest.styles?.entry;
    if (entry && sources.includes(entry)) {
      const result = styleRules(dir, sources, entry, context);
      findings.push(...result.findings);
      styles = result.compiled;
    }
    // Template code runs only once every static rule has passed.
    if (!findings.some((finding) => finding.severity === "error")) {
      findings.push(...(await renderRules(dir, manifest, context)));
    }
  }

  let starter: StarterContent | null = null;
  if (manifest?.starter && files.some((file) => file.path === manifest.starter)) {
    const json = await readJson(dir, manifest.starter);
    if (!json.ok) {
      findings.push({
        rule: "TPL-CONTENT-001",
        severity: "error",
        file: manifest.starter,
        message: json.message,
      });
    } else {
      const content = contentRules(manifest.starter, json.value, manifest, context);
      findings.push(...content.findings);
      starter = content.starter;
    }
  }
  return { findings, manifest, starter, styles };
}

export { type CodeContext, propsType } from "./code";
export { listFiles, type TemplateFile } from "./files";
export type { RenderContext } from "./render";
export type { CompiledStyles } from "./styles";
