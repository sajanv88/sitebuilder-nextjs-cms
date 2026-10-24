// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { AlertTriangleIcon } from "@nuvui/icons";
import type { Block } from "@sitebuilder/schema";
import type { ComponentType, ReactNode } from "react";
import * as v from "valibot";
import { PAGE_WIDTHS, type PageWidth, pageItemClass } from "./page/page";
import { BlockPlaceholder } from "./placeholder/block-placeholder";
import { getBlockDefinition } from "./registry";
import { cx } from "./shared";
import { surfaceOf } from "./surface/surface";
import type { AnyBlockDefinition, RenderContext } from "./types";

// Draws a list of blocks. The same code runs on the server for the public site and in the
// browser for the editor's canvas (design §2: what an editor sees is what ships).

export interface BlockFrameProps {
  block: Block;
  definition: AnyBlockDefinition;
  // How wide the block runs on the page, for a frame around a block on the page itself; the
  // frame is what sits in the page's grid (page/page.ts).
  pageWidth: PageWidth;
  children: ReactNode;
}

interface BlocksProps {
  blocks: readonly Block[];
  context: RenderContext;
  // The editor wraps each block in a frame it can select; the site draws them bare.
  frame?: ComponentType<BlockFrameProps>;
}

function OneBlock({
  block,
  context,
  frame: Frame,
}: { block: Block } & Omit<BlocksProps, "blocks">) {
  const definition = getBlockDefinition(block.type);
  if (!definition) {
    return context.editing ? (
      <BlockPlaceholder
        icon={AlertTriangleIcon}
      >{`Unknown block "${block.type}"`}</BlockPlaceholder>
    ) : null;
  }

  // Stored content has passed validateBlockList; this parse applies defaults, and keeps a block
  // a hand-edited row broke off the page. In the editor, a block being filled in is drawn as
  // far as it goes.
  const parsed = v.safeParse(definition.props, block.props);
  let props: Record<string, unknown>;
  if (parsed.success) props = parsed.output;
  else if (context.editing) props = { ...definition.defaults(), ...block.props };
  else return null;

  const inside = context.nested ? context : { ...context, nested: true };
  const children =
    definition.container && block.children && block.children.length > 0
      ? block.children.map((child) => (
          <OneBlock
            key={child.id}
            block={child}
            context={inside}
            {...(Frame ? { frame: Frame } : {})}
          />
        ))
      : undefined;
  const { Render } = definition;
  const width = props.pageWidth;
  const pageWidth: PageWidth =
    !context.nested && PAGE_WIDTHS.includes(width as PageWidth)
      ? (width as PageWidth)
      : "contained";
  const rendered = (
    <Render id={block.id} props={props} context={context}>
      {children}
    </Render>
  );
  // A block with a background is drawn on a panel, which takes its place on the page.
  const surface = definition.surface ? surfaceOf(props.background) : null;
  const drawn =
    surface && surface.kind !== "none" ? (
      <div
        className={cx(
          "block-surface",
          `block-surface--${surface.kind}`,
          pageItemClass(pageWidth),
          pageWidth === "full" && "block-surface--edge",
        )}
        {...surface.attributes}
      >
        {rendered}
      </div>
    ) : (
      rendered
    );
  return Frame ? (
    <Frame block={block} definition={definition} pageWidth={pageWidth}>
      {drawn}
    </Frame>
  ) : (
    drawn
  );
}

export function BlockList({ blocks, context, frame }: BlocksProps) {
  return blocks.map((block) => (
    <OneBlock key={block.id} block={block} context={context} {...(frame ? { frame } : {})} />
  ));
}
