import { LinkTarget } from "@sitebuilder/schema";
import * as v from "valibot";

// Pieces several blocks' props share.

// Text with a length limit, trimmed. Required text needs at least one character.
export const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1, "Write something here"), v.maxLength(max));
export const optionalText = (max: number) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)));

// A file in the media library, by id (design §4.2: never by URL). The message is what the
// inspector shows on a block whose file hasn't been chosen yet.
export const mediaId = v.pipe(v.string(), v.uuid("Choose a file from the media library"));

// A button's words and where it goes.
export const Action = v.strictObject({ label: text(60), href: LinkTarget });
export type Action = v.InferOutput<typeof Action>;

// Class names from a base and the modifiers that apply.
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

// The attributes of a link that opens in a new tab.
export const newTab = (open: boolean | undefined) =>
  open ? { target: "_blank", rel: "noopener noreferrer" } : {};

// 1048576 → "1 MB". For file sizes shown to visitors.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

// "21 Oct 2026", in UTC, so the server and the browser agree (design §7: no "today").
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
