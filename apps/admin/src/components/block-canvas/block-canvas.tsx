// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ColumnsIcon } from "@nuvui/icons";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import { type BlockFrameProps, BlockList, headingBlockId } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";
import { type CSSProperties, createContext, useContext, useEffect, useRef, useState } from "react";
import { useEditorData } from "@/components/block-editor/editor-data";
import "./block-canvas.scss";

// The page as visitors will see it (design §8), drawn by the same renderer as the site. A click
// selects the block under it (keyboard users select in the outline, which is a tree they can
// move through). Links and buttons in the blocks don't navigate or submit the editor's form.
// Blocks lay out by the width of the box they're drawn in (container queries). "Fit" fills the
// pane, for editing, and shows the layout for the pane's width. The devices are exact: the
// canvas is the site's content width, a tablet's or a phone's, so each shows the layout
// visitors get at that size. A canvas wider than the pane is drawn smaller to fit, and says how
// much smaller; it keeps its width, so its layout doesn't change.

export type Device = "fit" | "desktop" | "tablet" | "phone";

// How much smaller the canvas is drawn, and the room it then takes, from its own size and the
// pane's. Re-measured whenever either changes size.
function useFit(
  viewport: React.RefObject<HTMLDivElement | null>,
  canvas: React.RefObject<HTMLDivElement | null>,
) {
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const outer = viewport.current;
    const inner = canvas.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const scale = Math.min(1, outer.clientWidth / Math.max(1, inner.offsetWidth));
      setFit({ scale, height: inner.offsetHeight * scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [viewport, canvas]);
  return fit;
}

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
  device = "fit",
}: {
  blocks: readonly Block[];
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  device?: Device;
}) {
  const { context } = useEditorData();
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const fit = useFit(viewport, canvas);
  const scaled = fit.scale < 0.995;
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
    <div
      ref={viewport}
      className="block-canvas-viewport"
      // The scaled canvas takes no room of its own: the viewport holds its drawn height.
      style={scaled ? ({ blockSize: `${fit.height}px` } as CSSProperties) : undefined}
    >
      {scaled ? (
        <p className="block-canvas-viewport__scale">
          {`Shown at ${Math.round(fit.scale * 100)}% to fit`}
        </p>
      ) : null}
      <div
        ref={canvas}
        className={`block-canvas block-canvas--${device}`}
        style={scaled ? ({ transform: `scale(${fit.scale})` } as CSSProperties) : undefined}
      >
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
            {/* A hero that opens the page holds its h1, as on the site (decisions #68). */}
            <BlockList
              blocks={blocks}
              context={{ ...context, headingBlockId: headingBlockId(blocks) }}
              frame={Frame}
            />
          </Selection.Provider>
        )}
      </div>
    </div>
  );
}
