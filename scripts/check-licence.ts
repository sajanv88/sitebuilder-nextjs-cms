// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Checks the project's own licence notices (docs/licences.md has the rules):
//   - every source file we own starts with the SPDX line and the copyright line, after a
//     shebang if there is one;
//   - every package.json says "license": "GPL-2.0-or-later".
// Lists each file that doesn't and exits 1. `pnpm check:licence`, run in CI by pr.yaml.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LICENSE = "GPL-2.0-or-later";
const HOLDER = "Sajankumar Vijayan";
const YEAR = "2026";

const SOURCE = /\.(ts|tsx|mts|js|mjs|scss|css)$/;
// Generated or not ours: never given a header by hand.
const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /(^|\/)drizzle\//,
  /(^|\/)next-env\.d\.ts$/,
  /(^|\/)templates\.generated\.ts$/,
  /(^|\/)auth-schema\.ts$/,
];

const spdx = `SPDX-License-Identifier: ${LICENSE}`;
const copyright = `Copyright (C) ${YEAR} ${HOLDER}`;

function expected(file: string): [string, string] {
  return file.endsWith(".css")
    ? [`/* ${spdx} */`, `/* ${copyright} */`]
    : [`// ${spdx}`, `// ${copyright}`];
}

function problemWithHeader(file: string): string | null {
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.startsWith("#!")) lines.shift();
  const [wantSpdx, wantCopyright] = expected(file);
  if (lines[0] !== wantSpdx) return `no "${wantSpdx}" on the first line`;
  if (lines[1] !== wantCopyright) return `the second line isn't "${wantCopyright}"`;
  return null;
}

// Tracked files and new ones git doesn't ignore, less those deleted: what a commit would contain.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .split("\n")
  .filter((file) => file !== "" && !SKIP.some((pattern) => pattern.test(file)) && existsSync(file));

const problems: string[] = [];
for (const file of files) {
  if (SOURCE.test(file)) {
    const problem = problemWithHeader(file);
    if (problem) problems.push(`${file}: ${problem}`);
  } else if (file === "package.json" || file.endsWith("/package.json")) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as { license?: unknown };
    if (manifest.license !== LICENSE) {
      problems.push(`${file}: "license" is ${JSON.stringify(manifest.license)}, not "${LICENSE}"`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Licence notices missing or wrong in ${problems.length} files:`);
  console.error(problems.join("\n"));
  process.exit(1);
}
