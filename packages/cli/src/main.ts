// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { basename, join, relative, resolve } from "node:path";
import { validateContent } from "@sitebuilder/blocks/server";
import { SITEBUILDER_VERSION } from "@sitebuilder/schema";
import { type CheckContext, type Finding, runChecks } from "@sitebuilder/template-checks";
import { writeGenerated } from "./generate";
import { folderHash } from "./hash";
import {
  checkInstalled,
  findRoot,
  nuvuiVersion,
  TEMPLATES_DIR,
  type TemplateFinding,
} from "./installed";
import { CliError, LOCKFILE, readLockfile, writeLockfile } from "./lockfile";

// `sitebuilder`, the templates CLI (docs/templates_and_ai_design.md A6). Every command takes
// --json. Exit codes: 0 success, 1 findings or a hash mismatch, 2 usage or I/O.

const USAGE = `Usage: pnpm sitebuilder <command> [--json]

  generate                 Check every installed template and write templates/generated/
  template verify [path]   Check the installed templates, or any template folder
  template list            The installed templates: slug, version, source, hash
  template lock <slug>     Lock a bundled template at its current contents and version`;

interface Output {
  json: boolean;
}

function print(out: Output, value: unknown, text: string): void {
  process.stdout.write(`${out.json ? JSON.stringify(value, null, 2) : text}
`);
}

function describe(findings: readonly (Finding & { slug?: string })[]): string {
  return findings
    .map(
      (f) =>
        `${f.severity} ${f.rule} ${f.slug ? `templates/${f.slug}/` : ""}${f.file === "." ? "" : f.file}: ${f.message}`,
    )
    .join("\n");
}

const posixPath = (path: string) => path.replaceAll("\\", "/");

const errorsIn = (findings: readonly Finding[]) => findings.filter((f) => f.severity === "error");

async function context(root: string): Promise<CheckContext> {
  return {
    sitebuilderVersion: SITEBUILDER_VERSION,
    nuvuiVersion: await nuvuiVersion(root),
    validateContent,
  };
}

// Unreviewed (local) templates build anywhere but in production, unless explicitly allowed.
const allowLocal = () =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_UNREVIEWED_TEMPLATES === "true";

async function installedOrFail(root: string): Promise<Awaited<ReturnType<typeof checkInstalled>>> {
  const report = await checkInstalled(root, await context(root), { allowLocal: allowLocal() });
  if (errorsIn(report.findings).length > 0) {
    throw new FindingsError(report.findings);
  }
  return report;
}

class FindingsError extends CliError {
  constructor(readonly findings: readonly TemplateFinding[]) {
    super(`${errorsIn(findings).length} problem(s) in the installed templates`, 1);
  }
}

async function generate(root: string, out: Output): Promise<void> {
  const report = await installedOrFail(root);
  const file = await writeGenerated(root, report.checked);
  const slugs = report.checked.map((c) => c.entry.slug);
  print(
    out,
    {
      ok: true,
      templates: slugs,
      file: posixPath(relative(root, file)),
      findings: report.findings,
    },
    [
      describe(report.findings),
      `Generated ${posixPath(relative(root, file))} for ${slugs.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function verify(root: string, out: Output, path: string | undefined): Promise<void> {
  if (path === undefined) {
    const report = await installedOrFail(root);
    print(
      out,
      { ok: true, findings: report.findings },
      [describe(report.findings), `${report.checked.length} installed template(s) pass`]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }
  const dir = resolve(path);
  const report = await runChecks(dir, await context(root));
  const failed = errorsIn(report.findings).length > 0;
  print(
    out,
    { ok: !failed, findings: report.findings },
    [describe(report.findings), failed ? "" : `${basename(dir)} passes`].filter(Boolean).join("\n"),
  );
  if (failed) process.exitCode = 1;
}

async function list(root: string, out: Output): Promise<void> {
  const lock = await readLockfile(root);
  print(
    out,
    lock.templates,
    lock.templates
      .map(
        (t) =>
          `${t.slug.padEnd(24)} ${t.version.padEnd(10)} ${t.source.padEnd(8)} ${t.sha256.slice(0, 12)}`,
      )
      .join("\n"),
  );
}

// For maintainers of the bundled templates: after changing one on purpose, record its new
// contents. Templates from elsewhere come in through `template add` (phase 7B).
async function lock(root: string, out: Output, slug: string | undefined): Promise<void> {
  if (!slug) throw new CliError("Name the template: pnpm sitebuilder template lock <slug>", 2);
  const dir = join(root, TEMPLATES_DIR, slug);
  const report = await runChecks(dir, await context(root));
  if (errorsIn(report.findings).length > 0 || !report.manifest) {
    throw new FindingsError(report.findings.map((f) => ({ ...f, slug })));
  }
  const current = await readLockfile(root);
  const existing = current.templates.find((t) => t.slug === slug);
  if (existing?.source === "local") {
    throw new CliError(
      `${slug} came from elsewhere; replace it with \`template add --replace\` (phase 7B)`,
      2,
    );
  }
  const entry = {
    slug,
    version: report.manifest.version,
    source: "bundled" as const,
    sha256: await folderHash(dir),
  };
  await writeLockfile(root, {
    lockfileVersion: 1,
    templates: [...current.templates.filter((t) => t.slug !== slug), entry],
  });
  print(
    out,
    entry,
    `Locked ${slug} ${entry.version} in ${LOCKFILE} (${entry.sha256.slice(0, 12)})`,
  );
}

async function main(argv: readonly string[]): Promise<void> {
  const out: Output = { json: argv.includes("--json") };
  const args = argv.filter((arg) => arg !== "--json");
  const root = await findRoot(process.cwd());
  const [command, sub, arg] = args;
  if (command === "generate") return generate(root, out);
  if (command === "template") {
    if (sub === "verify") return verify(root, out, arg);
    if (sub === "list") return list(root, out);
    if (sub === "lock") return lock(root, out, arg);
    if (sub === "add" || sub === "remove") {
      throw new CliError(`\`template ${sub}\` arrives in phase 7B`, 2);
    }
  }
  throw new CliError(USAGE, 2);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const json = process.argv.includes("--json");
  if (error instanceof CliError) {
    const findings = error instanceof FindingsError ? error.findings : [];
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, findings }, null, 2)}
`);
    } else console.error([describe(findings), error.message].filter(Boolean).join("\n"));
    process.exitCode = error.exitCode;
    return;
  }
  console.error(error);
  process.exitCode = 2;
});
