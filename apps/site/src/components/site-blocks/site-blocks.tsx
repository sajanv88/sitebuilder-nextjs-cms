// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { type BlockFrameProps, BlockList, type RenderContext } from "@sitebuilder/blocks";
import type { BlockList as Blocks } from "@sitebuilder/schema";
import type { ComponentType } from "react";
import "./site-blocks.scss";

// A page's blocks, which a template's Page or Post layout receives as its children. The site
// draws them, in the page's grid, so every template lays blocks out the same way. The editor's
// canvas draws them here too, each in a frame it can select.
export function SiteBlocks({
  blocks,
  context,
  frame,
}: {
  blocks: Blocks;
  context: RenderContext;
  frame?: ComponentType<BlockFrameProps>;
}) {
  return (
    <div className="site-blocks block-page">
      <BlockList blocks={blocks} context={context} {...(frame ? { frame } : {})} />
    </div>
  );
}
