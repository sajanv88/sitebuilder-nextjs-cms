// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Lists every third-party package with its licence in THIRD_PARTY_LICENSES.md, and checks that
// each licence is one Sitebuilder, GPL-2.0-or-later, may combine with (design §9).
//
//   pnpm licence-list            rewrite THIRD_PARTY_LICENSES.md
//   pnpm licence-list --check    fail if a licence isn't allowed or the file is out of date (CI)
//
// Packages that declare `os` or `cpu` (Biome's CLI, sharp's libvips, the SWC binary…) install
// only for the machine they run on, so they're left out of the file, which would otherwise
// differ between a laptop and CI. Their licences are still checked.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Listed {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
}
type Report = Record<string, Listed[]>;

interface Rule {
  note: string;
  // Allowed in tooling, never in what the images ship.
  devOnly?: boolean;
}

// Reviewed for 0.1 on 2026-10-21. A licence not listed here fails the check until someone
// reviews it and adds it with a note.
const ALLOWED: Record<string, Rule> = {
  MIT: { note: "Permissive, GPL-compatible." },
  "MIT-0": { note: "Permissive, no attribution needed." },
  ISC: { note: "Permissive, GPL-compatible." },
  "BSD-2-Clause": { note: "Permissive, GPL-compatible." },
  "BSD-3-Clause": { note: "Permissive, GPL-compatible." },
  "0BSD": { note: "Permissive, no attribution needed." },
  "CC0-1.0": { note: "Public domain dedication." },
  "Apache-2.0": {
    note: "Compatible with GPL-3.0 only, which Sitebuilder's “or later” allows: a build that includes Apache-2.0 code is distributed under GPL-3.0.",
  },
  "MIT OR Apache-2.0": { note: "Used under MIT." },
  "MPL-2.0": {
    note: "File-level copyleft; MPL-2.0 §3.3 allows combining with the GPL. Changes to MPL files would stay MPL.",
  },
  "LGPL-3.0-or-later": {
    note: "sharp's libvips binary (per platform). LGPL-3.0 combines with GPL-3.0; the library stays replaceable as a separate shared object.",
  },
  "Apache-2.0 AND LGPL-3.0-or-later": {
    note: "sharp's prebuilt binary with libvips inside (per platform). See Apache-2.0 and LGPL-3.0-or-later.",
  },
  "CC-BY-4.0": {
    note: "Browser support data, not code (caniuse-lite). Attribution: this file names it.",
  },
  "Python-2.0": {
    note: "Tooling only (argparse, through js-yaml in the build tools).",
    devOnly: true,
  },
};

const OUTPUT = "THIRD_PARTY_LICENSES.md";

function list(prod: boolean): Report {
  // One fixed command line through the shell, which is how pnpm runs on Windows too (a .cmd
  // file there). Nothing in it comes from input.
  const command = `pnpm licenses list --recursive --json${prod ? " --prod" : ""}`;
  const out = execSync(command, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out) as Report;
}

function isPlatformPackage(paths: string[]): boolean {
  return paths.some((dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      os?: unknown;
      cpu?: unknown;
    };
    return manifest.os !== undefined || manifest.cpu !== undefined;
  });
}

interface Row {
  name: string;
  version: string;
  license: string;
  ships: boolean;
  platform: boolean;
}

function rows(): Row[] {
  const shipped = new Set<string>();
  for (const packages of Object.values(list(true))) {
    for (const p of packages) for (const version of p.versions) shipped.add(`${p.name}@${version}`);
  }
  const result: Row[] = [];
  for (const [license, packages] of Object.entries(list(false))) {
    for (const p of packages) {
      const platform = isPlatformPackage(p.paths);
      for (const version of p.versions) {
        result.push({
          name: p.name,
          version,
          license,
          ships: shipped.has(`${p.name}@${version}`),
          platform,
        });
      }
    }
  }
  const key = (row: Row) => `${row.name.replace(/^@/, "")}@${row.version}`;
  return result.sort((a, b) => key(a).localeCompare(key(b), "en"));
}

function problems(all: Row[]): string[] {
  const found: string[] = [];
  for (const row of all) {
    const rule = ALLOWED[row.license];
    if (!rule) {
      found.push(`${row.name}@${row.version}: ${row.license} isn't reviewed (scripts/licences.ts)`);
    } else if (rule.devOnly && row.ships) {
      found.push(
        `${row.name}@${row.version}: ${row.license} is allowed in tooling only, and it ships`,
      );
    }
  }
  return found;
}

function render(all: Row[]): string {
  const listed = all.filter((row) => !row.platform);
  const counts = new Map<string, { all: number; ships: number }>();
  for (const row of listed) {
    const count = counts.get(row.license) ?? { all: 0, ships: 0 };
    count.all += 1;
    if (row.ships) count.ships += 1;
    counts.set(row.license, count);
  }
  const licences = [...counts.entries()].sort(
    (a, b) => b[1].all - a[1].all || a[0].localeCompare(b[0]),
  );
  const lines = [
    "# Third-party licences",
    "",
    "Sitebuilder is GPL-2.0-or-later (`LICENSE`). This file lists every third-party package in the",
    "workspace with its licence, and whether it ships in the Docker images. It's generated by",
    "`pnpm licence-list` and checked in CI, which fails on a licence that hasn't been reviewed.",
    "",
    "Packages built for one platform only (declaring `os` or `cpu`, such as sharp's libvips and the",
    "compilers' native binaries) are left out of the table because they differ from machine to",
    "machine; their licences are checked all the same.",
    "",
    "## Licences",
    "",
    "| Licence | Packages | Shipped | Review |",
    "|---|---|---|---|",
    ...licences.map(
      ([licence, count]) =>
        `| ${licence} | ${count.all} | ${count.ships} | ${ALLOWED[licence]?.note ?? "Not reviewed."} |`,
    ),
    "",
    "Licences that only appear in platform packages:",
    "",
    ...Object.entries(ALLOWED)
      .filter(([licence]) => !counts.has(licence))
      .map(([licence, rule]) => `- **${licence}**: ${rule.note}`),
    "",
    "## Packages",
    "",
    "| Package | Version | Licence | Ships |",
    "|---|---|---|---|",
    ...listed.map(
      (row) => `| ${row.name} | ${row.version} | ${row.license} | ${row.ships ? "yes" : "no"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

const all = rows();
const found = problems(all);
const text = render(all);

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8").replaceAll("\r\n", "\n");
  } catch {
    // Missing counts as out of date.
  }
  if (current !== text)
    found.push(`${OUTPUT} is out of date: run \`pnpm licence-list\` and commit it`);
  if (found.length > 0) {
    console.error(found.join("\n"));
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, text);
  if (found.length > 0) {
    console.error(found.join("\n"));
    process.exit(1);
  }
}
