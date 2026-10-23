// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { TemplateBlock } from "@sitebuilder/template-sdk";
import { templateBlockLoaders } from "../generated/canvas";

// A template's block components, for the editor's canvas in the site zone, which draws a page's
// blocks in the browser (template blocks are written to run there too). Only the blocks: the
// canvas draws a template's layouts on the server, as the public site does.

export type CanvasBlocks = Readonly<Record<string, TemplateBlock<Record<string, unknown>>>>;

// The template's blocks by block type, loaded once. A template that isn't installed has none.
const loaded = new Map<string, Promise<CanvasBlocks>>();

export function loadCanvasBlocks(slug: string): Promise<CanvasBlocks> {
  let blocks = loaded.get(slug);
  if (!blocks) {
    const loaders = templateBlockLoaders[slug] ?? {};
    blocks = Promise.all(
      Object.entries(loaders).map(async ([type, load]) => [type, await load()] as const),
    ).then((entries) => Object.fromEntries(entries));
    loaded.set(slug, blocks);
  }
  return blocks;
}
