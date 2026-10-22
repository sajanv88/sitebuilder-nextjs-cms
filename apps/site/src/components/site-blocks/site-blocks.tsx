// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { BlockList, type RenderContext } from "@sitebuilder/blocks";
import type { BlockList as Blocks } from "@sitebuilder/schema";
import "./site-blocks.scss";

// A page's blocks, which a template's Page or Post layout receives as its children. The site
// draws them, in the page's grid, so every template lays blocks out the same way.
export function SiteBlocks({ blocks, context }: { blocks: Blocks; context: RenderContext }) {
  return (
    <div className="site-blocks block-page">
      <BlockList blocks={blocks} context={context} />
    </div>
  );
}
