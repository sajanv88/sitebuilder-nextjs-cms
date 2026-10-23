// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { BlockList } from "@sitebuilder/schema";
import type { PostSummary, RenderMedia } from "./types";

// The live canvas: the editor in the admin zone shows the page in an iframe
// at /_canvas/<entryId>, served by the site zone with the active template's layouts. The editor
// sends the blocks on every change and the iframe draws them; the iframe sends back what the
// editor acts on. Both sides take a message only from the other one, at the site's own origin.

export const CANVAS_PATH = "/_canvas";

// Every message carries this, so other messages a page receives (from the browser's tools, or
// an extension) are told apart.
const SOURCE = "sitebuilder-canvas";

// What the blocks point at, as the editor knows it: files, entries' paths (drafts too, by id)
// and the latest posts.
export interface CanvasData {
  media: Record<string, RenderMedia>;
  links: Record<string, string>;
  posts: readonly PostSummary[];
}

// From the editor to the canvas.
export type ToCanvas =
  | { type: "content"; blocks: BlockList }
  | { type: "data"; data: CanvasData }
  | { type: "selection"; selectedId: string | null; issueIds: readonly string[] }
  | { type: "scrollTo"; blockId: string }
  // What the layouts draw from the editor's fields rather than from the blocks. The canvas draws
  // its layouts on the server again when one changes.
  | { type: "entry"; title: string; featuredMediaId: string };

// The editor's own keys, pressed while the canvas has focus (entry-editor.tsx handles them).
export interface CanvasKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

// From the canvas to the editor.
export type FromCanvas =
  | { type: "ready" }
  | { type: "select"; blockId: string | null }
  | { type: "key"; key: CanvasKey };

export function canvasMessage<M extends ToCanvas | FromCanvas>(message: M): M & { source: string } {
  return { ...message, source: SOURCE };
}

const TO_CANVAS = new Set<string>(["content", "data", "selection", "scrollTo", "entry"]);
const FROM_CANVAS = new Set<string>(["ready", "select", "key"]);

function tagged(data: unknown, types: ReadonlySet<string>): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === SOURCE &&
    types.has(String((data as { type?: unknown }).type))
  );
}

// A message for the canvas, from the window that framed it, at the same origin.
export function readToCanvas(event: MessageEvent): ToCanvas | null {
  if (event.origin !== window.location.origin || event.source !== window.parent) return null;
  return tagged(event.data, TO_CANVAS) ? (event.data as ToCanvas) : null;
}

// A message for the editor, from its own canvas frame.
export function readFromCanvas(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): FromCanvas | null {
  if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) {
    return null;
  }
  return tagged(event.data, FROM_CANVAS) ? (event.data as FromCanvas) : null;
}

// Whether a key press is one of the editor's shortcuts: Ctrl+S, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y,
// Ctrl+K, Alt+↑, Alt+↓ and Delete (and ⌘ for Ctrl).
export function isEditorKey(key: CanvasKey): boolean {
  const mod = key.ctrlKey || key.metaKey;
  const name = key.key.toLowerCase();
  if (mod && !key.altKey) return ["s", "z", "y", "k"].includes(name);
  if (!mod && key.altKey) return name === "arrowup" || name === "arrowdown";
  return !mod && !key.altKey && name === "delete";
}
