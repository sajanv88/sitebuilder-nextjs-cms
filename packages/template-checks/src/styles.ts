// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createRequire } from "node:module";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TokenName, TokenValue } from "@sitebuilder/schema";
import postcss, { type Declaration, type Root } from "postcss";
import * as sass from "sass";
import * as v from "valibot";
import type { CodeContext } from "./code";
import type { Finding } from "./index";

// The rules for a template's stylesheet (docs/templates_and_ai_design.md A5). The entry is
// compiled as `generate` compiles it (decisions #110), and the CSS that would ship is judged
// with postcss: what reaches the browser is what counts, whatever the source looked like.

export interface CompiledStyles {
  css: string;
  // Files the stylesheet points at with url(), relative to the template folder, which
  // `generate` copies beside it.
  assets: string[];
}

const toPosix = (path: string) => path.split(sep).join("/");
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const DATA_LIMIT = 4 * 1024;

// `@use "@nuvui/react/scss/mixins"` resolves as it does in the site zone: from templates/, through
// nuvui's package exports. Nothing else outside the folder can be loaded.
function nuvuiImporter(resolveDir: string): sass.FileImporter<"sync"> {
  const require = createRequire(join(resolveDir, "__resolve__.js"));
  return {
    findFileUrl(url) {
      if (!url.startsWith("@nuvui/")) return null;
      try {
        return pathToFileURL(require.resolve(url));
      } catch {
        return null;
      }
    },
  };
}

export function compileStyles(
  dir: string,
  entry: string,
  context: CodeContext,
): { ok: true; value: CompiledStyles; loaded: string[] } | { ok: false; message: string } {
  const path = join(dir, entry);
  try {
    if (entry.endsWith(".css")) {
      return {
        ok: true,
        value: { css: sass.compile(path, { style: "expanded" }).css, assets: [] },
        loaded: [path],
      };
    }
    const result = sass.compile(path, {
      style: "expanded",
      importers: [nuvuiImporter(context.resolveDir)],
    });
    return {
      ok: true,
      value: { css: result.css, assets: [] },
      loaded: result.loadedUrls.map((url) => fileURLToPath(url)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { ok: false, message: message ?? "It doesn't compile" };
  }
}

const isRoot = (selector: string) =>
  selector.split(",").some((part) => /^\s*(:root|html)\s*$/i.test(part));

export function styleRules(
  dir: string,
  files: readonly string[],
  entry: string,
  context: CodeContext,
): { findings: Finding[]; compiled: CompiledStyles | null } {
  const findings: Finding[] = [];
  const error = (rule: string, message: string) =>
    findings.push({ rule, severity: "error", file: entry, message });

  const compiled = compileStyles(dir, entry, context);
  if (!compiled.ok) {
    // A stylesheet that doesn't compile can't ship: the same as a type error in code.
    findings.push({
      rule: "TPL-TYPES-001",
      severity: "error",
      file: entry,
      message: compiled.message,
    });
    return { findings, compiled: null };
  }
  const nuvui = join(context.resolveDir, "node_modules");
  for (const loaded of compiled.loaded) {
    const inside = !relative(dir, loaded).startsWith("..");
    const fromNuvui =
      toPosix(loaded).includes("/@nuvui/") || !relative(nuvui, loaded).startsWith("..");
    if (!inside && !fromNuvui) {
      error("TPL-CSS-001", `It loads ${toPosix(loaded)}, outside the template folder`);
    }
  }

  let root: Root;
  try {
    root = postcss.parse(compiled.value.css);
  } catch (cause) {
    error("TPL-TYPES-001", cause instanceof Error ? cause.message : String(cause));
    return { findings, compiled: null };
  }
  const present = new Set(files);
  const base = posix.dirname(entry);
  const assets = new Set<string>();

  // Every url() in a value: external ones are refused, data: ones are small, relative ones stay in
  // the folder and exist.
  const urls = (value: string) =>
    [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => m[2] ?? "");
  const checkUrl = (url: string, where: string) => {
    if (/^data:/i.test(url)) {
      if (url.length > DATA_LIMIT) error("TPL-CSS-001", `${where}: a data: address over 4 KiB`);
      return null;
    }
    if (EXTERNAL.test(url)) {
      error("TPL-CSS-001", `${where}: ${url} is outside the site`);
      return null;
    }
    const target = posix.normalize(posix.join(base, url.split(/[?#]/)[0] ?? ""));
    if (target.startsWith("..") || posix.isAbsolute(url)) {
      error("TPL-CSS-001", `${where}: ${url} leaves the template folder`);
      return null;
    }
    if (!present.has(target)) {
      error("TPL-CSS-001", `${where}: ${url} isn't in the folder`);
      return null;
    }
    assets.add(target);
    return target;
  };

  root.walkAtRules((rule) => {
    if (rule.name.toLowerCase() === "import") {
      error("TPL-CSS-001", `@import ${rule.params}: a template's styles are one file`);
    }
    if (rule.name.toLowerCase() === "font-face") {
      rule.walkDecls(/^src$/i, (decl) => {
        for (const url of urls(decl.value)) {
          if (EXTERNAL.test(url) && !/^data:/i.test(url)) {
            error("TPL-CSS-002", `@font-face: ${url} is a remote font; ship it as a woff2 file`);
            continue;
          }
          const target = checkUrl(url, "@font-face");
          if (target && !target.endsWith(".woff2")) {
            error("TPL-CSS-002", `@font-face: ${url} isn't a woff2 file`);
          }
        }
      });
    }
  });

  root.walkDecls((decl: Declaration) => {
    const prop = decl.prop.toLowerCase();
    const value = decl.value;
    if (decl.parent?.type !== "atrule" || (decl.parent as { name?: string }).name !== "font-face") {
      for (const url of urls(value)) checkUrl(url, prop);
    }
    if (/expression\s*\(/i.test(value) || prop === "behavior" || prop === "-moz-binding") {
      error("TPL-CSS-003", `${prop}: ${value.slice(0, 60)} isn't allowed`);
    }
    if (prop.startsWith("--") && v.is(TokenName, prop)) {
      const selector =
        decl.parent?.type === "rule" ? (decl.parent as { selector: string }).selector : "";
      if (isRoot(selector)) {
        error(
          "TPL-CSS-005",
          `${prop} on ${selector}: set theme tokens in template.json's theme, so Appearance can change them`,
        );
      } else if (!v.safeParse(TokenValue, value).success) {
        error("TPL-CSS-005", `${prop}: "${value.slice(0, 60)}" isn't a value a token takes`);
      }
    }
    if (!prop.startsWith("--") && /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(value)) {
      findings.push({
        rule: "TPL-CSS-006",
        severity: "warn",
        file: entry,
        message: `${prop}: ${value.slice(0, 60)} is a colour written out; use a token`,
      });
    }
  });

  root.walkRules((rule) => {
    if (/\.nuv-/.test(rule.selector)) {
      error(
        "TPL-CSS-004",
        `${rule.selector}: set nuvui's --nuv-* variables instead of selecting its classes`,
      );
    }
  });

  return { findings, compiled: { css: compiled.value.css, assets: [...assets].sort() } };
}
