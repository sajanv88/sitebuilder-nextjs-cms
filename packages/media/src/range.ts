import type { ByteRange } from "./storage/types";

// One range from an HTTP Range header ("bytes=0-1023", "bytes=1024-", "bytes=-500"), for video
// seeking. Several ranges in one header are served as the whole file, which HTTP allows.
// "unsatisfiable" asks for a 416.
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (size === 0) return "unsatisfiable";

  if (from === "") {
    // The last N bytes.
    const length = Number(to);
    if (length === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
