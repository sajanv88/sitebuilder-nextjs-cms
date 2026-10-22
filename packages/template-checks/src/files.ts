// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface TemplateFile {
  // Relative to the template folder, with "/" separators.
  path: string;
  size: number;
  symlink: boolean;
  // Marked executable and starts as a program does. Always false on Windows.
  executable: boolean;
}

// How a program starts: a script's "#!", Linux's ELF header, a Windows executable's "MZ".
const PROGRAM_STARTS = [
  Buffer.from("#!"),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from("MZ"),
];

// The execute bit alone says little: a Docker build context sent from Windows marks every file
// executable. A file counts when it also starts like a program.
async function isProgram(path: string): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await file.read(head, 0, 4, 0);
    return PROGRAM_STARTS.some(
      (start) => bytesRead >= start.length && head.subarray(0, start.length).equals(start),
    );
  } finally {
    await file.close();
  }
}

// Every file under `dir`, symbolic links included and not followed, sorted by path. Folders
// aren't listed: an empty one changes nothing.
export async function listFiles(dir: string): Promise<TemplateFile[]> {
  const out: TemplateFile[] = [];
  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(join(dir, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const full = join(dir, path);
      const stats = await lstat(full);
      if (stats.isDirectory()) await walk(path);
      else {
        const marked = process.platform !== "win32" && stats.isFile() && (stats.mode & 0o111) !== 0;
        out.push({
          path,
          size: stats.size,
          symlink: stats.isSymbolicLink(),
          executable: marked && (await isProgram(full)),
        });
      }
    }
  };
  await walk("");
  return out.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}
