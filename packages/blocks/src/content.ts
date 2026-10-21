import type { Block } from "@sitebuilder/schema";
import { getBlockDefinition } from "./registry";

// Helpers for a list of blocks, used by the editor and by whatever draws a page.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// A block's id: 16 random characters, inside NodeId's 8 to 32 (design §5.1). Made in the browser
// as blocks are added, and on the server for new content.
export function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

// A new block of a type, with its default props. Columns start with two empty columns, the
// fewest they may hold.
export function createBlock(type: string): Block {
  const definition = getBlockDefinition(type);
  if (!definition) throw new Error(`Unknown block type "${type}"`);
  const block: Block = { id: newBlockId(), type, props: definition.defaults() };
  if (type === "columns") block.children = [createBlock("column"), createBlock("column")];
  else if (definition.container) block.children = [];
  return block;
}

// The same block, and everything inside it, with new ids: for "Duplicate".
export function cloneBlock(block: Block): Block {
  return {
    ...block,
    id: newBlockId(),
    props: structuredClone(block.props),
    ...(block.children ? { children: block.children.map(cloneBlock) } : {}),
  };
}

function walkValues(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkValues(item, visit);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      visit(key, inner);
      walkValues(inner, visit);
    }
  }
}

const MEDIA_KEYS = new Set(["mediaId", "imageMediaId", "posterMediaId"]);

// The media a list of blocks uses, by the same props the database's usage check looks at
// (packages/db mediaUsage): mediaId, imageMediaId, posterMediaId and mediaIds.
export function collectMediaIds(blocks: readonly Block[]): string[] {
  const ids = new Set<string>();
  walkValues(blocks, (key, value) => {
    if (MEDIA_KEYS.has(key) && typeof value === "string" && value) ids.add(value);
    if (key === "mediaIds" && Array.isArray(value)) {
      for (const id of value) if (typeof id === "string") ids.add(id);
    }
  });
  return [...ids];
}

// The entries a list of blocks links to ({ kind: "entry", entryId }), to look up their paths.
export function collectEntryIds(blocks: readonly Block[]): string[] {
  const ids = new Set<string>();
  walkValues(blocks, (_key, value) => {
    if (
      value &&
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "entry" &&
      "entryId" in value &&
      typeof value.entryId === "string"
    ) {
      ids.add(value.entryId);
    }
  });
  return [...ids];
}
