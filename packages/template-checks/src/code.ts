// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import type { TemplateField, TemplateManifest } from "@sitebuilder/schema";
import ts from "typescript6";
import type { Finding } from "./index";

// The rules for a template's code (docs/templates_and_ai_design.md A5): imports, the APIs it may
// not reach, signs of obfuscation, nuvui, and the type check. Sources are read with TypeScript's
// compiler API (version 6: 7 has no JavaScript API, decisions #113) and judged from the syntax
// tree and the type checker, never from regular expressions on the text: a free variable named
// `process` is the global, and a local of that name isn't.

export interface CodeContext {
  // The folder whose node_modules a template's imports resolve from: templates/, which depends on
  // React, nuvui, Next and the SDK, as the site zone that compiles the code does.
  resolveDir: string;
  // The @nuvui packages a template may import: those whose stylesheet the site loads.
  nuvuiPackages: readonly string[];
}

const CODE = [".ts", ".tsx"];

// Bare imports a template may make (TPL-IMPORT-001); @nuvui/* is judged by TPL-NUVUI-002.
const ALLOWED_IMPORTS = new Set([
  "react",
  "react/jsx-runtime",
  "@sitebuilder/template-sdk",
  "next/link",
  "next/image",
]);

// Globals a template may not reach (TPL-API-001).
const BANNED_GLOBALS = new Set([
  "eval",
  "Function",
  "require",
  "process",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  // The usual ways round a list of names (decisions #115).
  "Reflect",
  "Proxy",
]);
// Properties that reach a function's constructor, and so Function, whatever it's called.
const BANNED_PROPERTIES = new Set(["constructor", "__proto__"]);
// Objects that hold the globals, reached by name or by index (TPL-API-001, TPL-OBF-003).
const GLOBAL_OBJECTS = new Set([
  "window",
  "globalThis",
  "self",
  "top",
  "parent",
  "frames",
  "document",
  "navigator",
]);
const HTML_WRITERS = new Set(["innerHTML", "outerHTML", "insertAdjacentHTML"]);
const BANNED_ELEMENTS = new Set(["script", "iframe", "object", "embed", "form"]);
// Controls that come from @nuvui/react, not the browser (TPL-NUVUI-001).
const NUVUI_ELEMENTS = new Set(["button", "input", "select", "textarea", "dialog", "menu"]);
const NUVUI_ROLES = new Set([
  "tab",
  "tablist",
  "tabpanel",
  "menu",
  "menubar",
  "menuitem",
  "dialog",
  "alertdialog",
  "listbox",
  "combobox",
]);

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const isExternal = (url: string) => EXTERNAL.test(url.trim()) && !/^data:/i.test(url.trim());
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;
const HEX = /^[0-9a-fA-F]+$/;

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  isolatedModules: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  // No Node types: `process` and `require` stay unknown to the checker.
  types: [],
};

const CONTRACT = "__contract__.tsx";

const LAYOUT_TYPES = {
  site: "SiteLayout",
  page: "PageLayout",
  post: "PostLayout",
  archive: "ArchiveLayout",
  notFound: "NotFoundLayout",
} as const;

const LINK_TARGET = '{ kind: "entry"; entryId: string } | { kind: "url"; url: string }';

// The TypeScript type of a template block's props, from its declared fields: what the site will
// hand its component once the props have passed the schema built from the same fields.
export function propsType(
  fields: readonly TemplateField[],
  defaults: Record<string, unknown>,
): string {
  const members = fields.map((field) => {
    const optional =
      field.kind === "alt" ||
      ("optional" in field && field.optional === true) ||
      (field.kind !== "text" && defaults[field.name] === undefined);
    let type: string;
    switch (field.kind) {
      case "text":
      case "media":
      case "alt":
      case "icon":
        type = "string";
        break;
      case "choice":
        type = field.options.map((option) => JSON.stringify(option.value)).join(" | ");
        break;
      case "toggle":
        type = "boolean";
        break;
      case "number":
        type = "number";
        break;
      case "link":
        type = LINK_TARGET;
        break;
      case "action":
        type = `{ label: string; href: ${LINK_TARGET} }`;
        break;
    }
    return `${field.name}${optional ? "?" : ""}: ${type}`;
  });
  return `{ ${members.join("; ")} }`;
}

// A module that assigns each layout and block to its type in the SDK, so the type check says
// when one doesn't fit its slot (TPL-TYPES-001). A file that isn't there is TPL-MANIFEST-002's.
function contractSource(
  manifest: TemplateManifest,
  present: ReadonlySet<string>,
): { text: string; owners: string[] } {
  const lines = [
    'import type { ArchiveLayout, NotFoundLayout, PageLayout, PostLayout, SiteLayout, TemplateBlock } from "@sitebuilder/template-sdk";',
  ];
  // The template file each line's error belongs to, by line number.
  const owners = [""];
  const withoutExtension = (file: string) => `./${file.replace(/\.tsx$/, "")}`;
  let n = 0;
  for (const [name, type] of Object.entries(LAYOUT_TYPES)) {
    const file = manifest.components?.[name as keyof typeof LAYOUT_TYPES];
    if (!file || !present.has(file)) continue;
    lines.push(`import L${n} from ${JSON.stringify(withoutExtension(file))};`);
    owners.push(file);
    lines.push(`export const l${n}: ${type} = L${n};`);
    owners.push(file);
    n += 1;
  }
  for (const [index, block] of (manifest.blocks ?? []).entries()) {
    if (!present.has(block.component)) continue;
    lines.push(`import B${index} from ${JSON.stringify(withoutExtension(block.component))};`);
    owners.push(block.component);
    lines.push(
      `export const b${index}: TemplateBlock<${propsType(block.fields, block.defaults)}> = B${index};`,
    );
    owners.push(block.component);
  }
  return { text: `${lines.join("\n")}\n`, owners };
}

const toPosix = (path: string) => path.split(sep).join("/");

export async function codeRules(
  dir: string,
  files: readonly string[],
  manifest: TemplateManifest,
  context: CodeContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const sources = files.filter((file) => CODE.some((extension) => file.endsWith(extension)));
  const styles = files.filter((file) => file.endsWith(".css") || file.endsWith(".scss"));

  // TPL-OBF-001 reads the text itself: a line that long is minified, whatever it says.
  for (const file of [...sources, ...styles]) {
    const lines = (await readFile(join(dir, file), "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.length > 500) {
        findings.push({
          rule: "TPL-OBF-001",
          severity: "error",
          file,
          line: index + 1,
          message: `A line of ${line.length} characters: is this minified code?`,
        });
      }
    });
  }
  if (sources.length === 0 && !manifest.components && !manifest.blocks) return findings;

  const contract = contractSource(manifest, new Set(files));
  const contractPath = join(dir, CONTRACT);
  const host = ts.createCompilerHost(OPTIONS, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create) =>
    toPosix(name) === toPosix(contractPath)
      ? ts.createSourceFile(name, contract.text, version, true, ts.ScriptKind.TSX)
      : getSourceFile(name, version, onError, create);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => toPosix(name) === toPosix(contractPath) || fileExists(name);
  // Bare imports resolve from resolveDir, wherever the template folder is; relative ones from the
  // file that makes them.
  const anchor = join(context.resolveDir, "__resolve__.ts");
  host.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((literal) =>
      ts.resolveModuleName(
        literal.text,
        literal.text.startsWith(".") ? containingFile : anchor,
        OPTIONS,
        host,
      ),
    );

  const roots = [...sources.map((file) => join(dir, file)), contractPath];
  const program = ts.createProgram(roots, OPTIONS, host);
  const checker = program.getTypeChecker();
  const inTemplate = (file: ts.SourceFile) => {
    const path = relative(dir, file.fileName);
    return !path.startsWith("..") && !file.isDeclarationFile;
  };

  for (const source of program.getSourceFiles()) {
    if (!inTemplate(source) || toPosix(source.fileName) === toPosix(contractPath)) continue;
    findings.push(...fileRules(source, dir, checker, context));
  }
  // One problem, one finding: a line another rule reports isn't reported again as a type error
  // (an import of a nuvui name that doesn't exist is TPL-NUVUI-002, not also "no exported member").
  const flagged = new Set(findings.map((finding) => `${finding.file}:${finding.line}`));

  // TPL-TYPES-001: the template type-checks strictly against the SDK, and fits its slots.
  for (const source of program.getSourceFiles()) {
    if (!inTemplate(source)) continue;
    const isContract = toPosix(source.fileName) === toPosix(contractPath);
    const file = toPosix(relative(dir, source.fileName));
    const diagnostics = [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ];
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
      const line =
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line
          : 0;
      if (!isContract && flagged.has(`${file}:${line + 1}`)) continue;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      findings.push({
        rule: "TPL-TYPES-001",
        severity: "error",
        file: isContract ? (contract.owners[line] ?? CONTRACT) : file,
        ...(isContract ? {} : { line: line + 1 }),
        message: isContract ? `Doesn't fit its place in template.json: ${message}` : message,
      });
    }
  }
  return findings;
}

// Whether `node` stands for a value by its own name, not a property's or a type's.
function isValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  )
    return false;
  if (ts.isJsxAttribute(parent)) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return false;
  for (let up: ts.Node = parent; up && !ts.isSourceFile(up); up = up.parent) {
    if (ts.isTypeNode(up) && !ts.isTypeQueryNode(up)) return false;
  }
  return true;
}

function fileRules(
  source: ts.SourceFile,
  dir: string,
  checker: ts.TypeChecker,
  context: CodeContext,
): Finding[] {
  const findings: Finding[] = [];
  const file = toPosix(relative(dir, source.fileName));
  const error = (rule: string, node: ts.Node, message: string) =>
    findings.push({
      rule,
      severity: "error",
      file,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      message,
    });

  // A name that means the global: declared nowhere in the template (only in the libraries), or
  // not at all.
  const isGlobal = (node: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(node);
    const declarations = symbol?.declarations ?? [];
    return declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile);
  };
  const globalObject = (node: ts.Expression) =>
    ts.isIdentifier(node) && GLOBAL_OBJECTS.has(node.text) && isGlobal(node) ? node.text : null;

  const checkImport = (specifier: string, node: ts.Node) => {
    if (specifier.startsWith(".")) {
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      if (target.startsWith("..") || posix.isAbsolute(target)) {
        error("TPL-IMPORT-001", node, `"${specifier}" leaves the template folder`);
      }
      return;
    }
    if (specifier.startsWith("@nuvui/")) {
      const name = specifier.split("/").slice(0, 2).join("/");
      if (!context.nuvuiPackages.includes(name)) {
        error(
          "TPL-NUVUI-002",
          node,
          `${name} isn't one the site loads; use ${context.nuvuiPackages.join(", ")}`,
        );
      }
      return;
    }
    if (!ALLOWED_IMPORTS.has(specifier)) {
      error(
        "TPL-IMPORT-001",
        node,
        `"${specifier}" can't be imported: only React, nuvui, next/link, next/image, the SDK and the template's own files`,
      );
    }
  };

  const nuvuiNames = (declaration: ts.ImportDeclaration) => {
    const specifier = (declaration.moduleSpecifier as ts.StringLiteral).text;
    if (!specifier.startsWith("@nuvui/")) return;
    const named = declaration.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) return;
    const module = checker.getSymbolAtLocation(declaration.moduleSpecifier);
    if (!module) {
      error("TPL-NUVUI-002", declaration, `${specifier} isn't installed`);
      return;
    }
    const exported = new Set(checker.getExportsOfModule(module).map((symbol) => symbol.name));
    for (const element of named.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (!exported.has(name)) {
        error("TPL-NUVUI-002", element, `${specifier} has no export named ${name}`);
      }
    }
  };

  const attribute = (attributes: ts.JsxAttributes, name: string) =>
    attributes.properties.find(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) && property.name.getText(source) === name,
    );
  const literal = (attr: ts.JsxAttribute | undefined): string | null => {
    const value = attr?.initializer;
    if (!value) return null;
    if (ts.isStringLiteral(value)) return value.text;
    if (ts.isJsxExpression(value) && value.expression) {
      const expression = value.expression;
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.text;
      }
    }
    return null;
  };

  const element = (
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    tag: string,
    attributes: ts.JsxAttributes,
  ) => {
    const intrinsic = /^[a-z]/.test(tag) && !tag.includes(".");
    if (intrinsic && BANNED_ELEMENTS.has(tag)) {
      error("TPL-API-004", node, `<${tag}> isn't allowed in a template`);
    }
    if (intrinsic && NUVUI_ELEMENTS.has(tag)) {
      error("TPL-NUVUI-001", node, `<${tag}>: use nuvui's component from @nuvui/react`);
    }
    const role = literal(attribute(attributes, "role"));
    if (role && NUVUI_ROLES.has(role)) {
      error("TPL-NUVUI-001", node, `role="${role}": use nuvui's component from @nuvui/react`);
    }
    if (attribute(attributes, "dangerouslySetInnerHTML")) {
      error("TPL-API-002", node, "dangerouslySetInnerHTML isn't allowed: the host draws HTML");
    }
    for (const name of ["src", "srcSet", "srcset", "poster"]) {
      const value = literal(attribute(attributes, name));
      if (value?.split(",").some((part) => isExternal(part))) {
        error("TPL-API-005", node, `${name} points outside the site: ${value.slice(0, 80)}`);
      }
    }
    const href = literal(attribute(attributes, "href"));
    if (href && isExternal(href) && !/^(mailto|tel):/i.test(href)) {
      const rel = (literal(attribute(attributes, "rel")) ?? "").split(/\s+/);
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
        error("TPL-API-006", node, `A link to ${href} needs rel="noopener noreferrer"`);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) checkImport(specifier.text, node);
      if (ts.isImportDeclaration(node)) nuvuiNames(node);
    } else if (ts.isImportEqualsDeclaration(node)) {
      error("TPL-API-001", node, "require-style imports aren't allowed");
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        checkImport(argument.literal.text, node);
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      error("TPL-API-001", node, "import() isn't allowed: a template loads nothing at run time");
    } else if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && isValueReference(node)) {
      if (isGlobal(node)) error("TPL-API-001", node, `${node.text} isn't allowed in a template`);
    } else if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      const holder = globalObject(node.expression);
      if (holder && BANNED_GLOBALS.has(name)) {
        error("TPL-API-001", node, `${holder}.${name} isn't allowed in a template`);
      }
      if (name === "sendBeacon") error("TPL-API-001", node, "sendBeacon isn't allowed");
      if (BANNED_PROPERTIES.has(name)) error("TPL-API-001", node, `.${name} isn't allowed`);
      if (HTML_WRITERS.has(name)) error("TPL-API-002", node, `${name} isn't allowed`);
      if (holder === "document" && (name === "write" || name === "writeln")) {
        error("TPL-API-002", node, `document.${name} isn't allowed`);
      }
    } else if (ts.isElementAccessExpression(node)) {
      const holder = globalObject(node.expression);
      if (holder) error("TPL-OBF-003", node, `${holder}[…]: reach a global by its name`);
      const argument = node.argumentExpression;
      if (ts.isStringLiteral(argument) && HTML_WRITERS.has(argument.text)) {
        error("TPL-API-002", node, `${argument.text} isn't allowed`);
      }
      if (ts.isStringLiteral(argument) && BANNED_PROPERTIES.has(argument.text)) {
        error("TPL-API-001", node, `[${JSON.stringify(argument.text)}] isn't allowed`);
      }
    } else if (
      ts.isExpressionStatement(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === "use server"
    ) {
      error("TPL-API-003", node, '"use server" isn\'t allowed: templates have no server actions');
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (text.length > 200 && (HEX.test(text) || (BASE64.test(text) && !text.includes(" ")))) {
        error("TPL-OBF-002", node, `A ${text.length}-character encoded string`);
      }
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      element(node, node.tagName.getText(source), node.attributes);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "createElement"
    ) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first) && BANNED_ELEMENTS.has(first.text)) {
        error("TPL-API-004", node, `<${first.text}> isn't allowed in a template`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}
