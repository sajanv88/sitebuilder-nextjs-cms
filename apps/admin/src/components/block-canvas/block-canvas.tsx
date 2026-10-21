"use client";

import { ColumnsIcon } from "@nuvui/icons";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import { type BlockFrameProps, BlockList } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";
import { createContext, useContext, useEffect, useRef } from "react";
import { useEditorData } from "@/components/block-editor/editor-data";
import "./block-canvas.scss";

// The page as visitors will see it (design §8), drawn by the same renderer as the site. A click
// selects the block under it (keyboard users select in the outline, which is a tree they can
// move through). Links and buttons in the blocks don't navigate or submit the editor's form.

const Selection = createContext<{ selectedId: string | null; issueIds: ReadonlySet<string> }>({
  selectedId: null,
  issueIds: new Set(),
});

function Frame({ block, definition, children }: BlockFrameProps) {
  const { selectedId, issueIds } = useContext(Selection);
  const classes = ["block-canvas__block"];
  if (block.id === selectedId) classes.push("block-canvas__block--selected");
  if (issueIds.has(block.id)) classes.push("block-canvas__block--problem");
  return (
    <div className={classes.join(" ")} data-block-id={block.id} data-block-label={definition.label}>
      {children}
    </div>
  );
}

export function BlockCanvas({
  blocks,
  selectedId,
  issueIds,
  onSelect,
}: {
  blocks: readonly Block[];
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
}) {
  const { context } = useEditorData();
  const canvas = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  // One listener in the capture phase, so it sees every click before a block's own handlers.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      const submit = event.target.closest("button[type='submit'], button:not([type])");
      if (link || submit) event.preventDefault();
      const frame = event.target.closest<HTMLElement>("[data-block-id]");
      select.current(frame?.dataset.blockId ?? null);
    };
    element.addEventListener("click", onClick, true);
    return () => element.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div ref={canvas} className="block-canvas">
      {blocks.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <ColumnsIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>An empty page</EmptyTitle>
          <EmptyDescription>
            Add a block from Add: a heading, some text, a hero to start a landing page.
          </EmptyDescription>
        </Empty>
      ) : (
        <Selection.Provider value={{ selectedId, issueIds }}>
          <BlockList blocks={blocks} context={context} frame={Frame} />
        </Selection.Provider>
      )}
    </div>
  );
}
