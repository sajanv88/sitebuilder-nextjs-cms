import { AlertTriangleIcon } from "@nuvui/icons";
import type { Block } from "@sitebuilder/schema";
import type { ComponentType, ReactNode } from "react";
import * as v from "valibot";
import { BlockPlaceholder } from "./placeholder/block-placeholder";
import { getBlockDefinition } from "./registry";
import type { AnyBlockDefinition, RenderContext } from "./types";

// Draws a list of blocks. The same code runs on the server for the public site and in the
// browser for the editor's canvas (design §2: what an editor sees is what ships).

export interface BlockFrameProps {
  block: Block;
  definition: AnyBlockDefinition;
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

  const children =
    definition.container && block.children && block.children.length > 0
      ? block.children.map((child) => (
          <OneBlock
            key={child.id}
            block={child}
            context={context}
            {...(Frame ? { frame: Frame } : {})}
          />
        ))
      : undefined;
  const { Render } = definition;
  const drawn = (
    <Render id={block.id} props={props} context={context}>
      {children}
    </Render>
  );
  return Frame ? (
    <Frame block={block} definition={definition}>
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
