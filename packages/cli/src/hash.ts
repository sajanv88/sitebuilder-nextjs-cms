// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listFiles } from "@sitebuilder/template-checks";

// A template folder's hash (docs/templates_and_ai_design.md A3): every file's path, with "/"
// separators, sorted by UTF-8 bytes, and the sha256 of its bytes, one "<path>\n<hash>\n" pair
// after another, hashed again. Empty folders and file modes don't count.
export async function folderHash(dir: string): Promise<string> {
  const outer = createHash("sha256");
  for (const file of await listFiles(dir)) {
    const inner = createHash("sha256").update(await readFile(join(dir, file.path)));
    outer.update(`${file.path}\n${inner.digest("hex")}\n`);
  }
  return outer.digest("hex");
}
