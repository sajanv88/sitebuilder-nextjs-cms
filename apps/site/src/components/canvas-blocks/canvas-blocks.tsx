// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ColumnsIcon, GripVerticalIcon } from "@nuvui/icons";
import { Button, Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import {
  type BlockFrameProps,
  type CanvasData,
  canvasMessage,
  type FromCanvas,
  headingBlockId,
  isEditorKey,
  type Move,
  pageItemClass,
  type RenderContext,
  readToCanvas,
} from "@sitebuilder/blocks";
import {
  type BlockList,
  type DateSettings,
  pageBackgroundCss,
  type SettingsValue,
} from "@sitebuilder/schema";
import { loadCanvasBlocks } from "@sitebuilder/templates/canvas";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createContext, use, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { CanvasDrag } from "@/components/canvas-drag/canvas-drag";
import { CanvasWidths } from "@/components/canvas-widths/canvas-widths";
import { useNonce } from "@/components/nonce-provider/nonce-provider";
import { SiteBlocks } from "@/components/site-blocks/site-blocks";
import { SiteImage } from "@/components/site-image/site-image";
import "@/lib/template-blocks";
import "./canvas-blocks.scss";

// The blocks of the editor's canvas (app/%5Fcanvas): drawn in the browser, from what the editor
// sends on every change, inside the active template's layouts, which the server draws. A click
// selects the block under it, and links and buttons don't navigate or submit. The editor's
// shortcuts pressed here go to the editor. The selected block can be dragged by its grip, and
// columns' widths by the line between them (decisions #152).

// What the canvas shows. In the browser it lives outside React, so it outlasts the page being
// drawn again on the server (when the title changes, below). Never on the server, where a
// module is shared by every request.
interface CanvasState {
  blocks: BlockList;
  data: CanvasData;
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  // Whether blocks may be dragged and columns resized: not while the assistant's proposal shows.
  editable: boolean;
  // The title and featured picture the editor has, which the layouts draw on the server.
  title: string;
  featuredMediaId: string;
  // The background the editor has: null until it says, then "#rrggbb" or "" for the theme's.
  background: string | null;
}

let state: CanvasState | null = null;
const listeners = new Set<() => void>();

function update(next: Partial<CanvasState>) {
  if (!state) return;
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function post(message: FromCanvas) {
  if (window.parent !== window) {
    window.parent.postMessage(canvasMessage(message), window.location.origin);
  }
}

// Once per document: the editor answers with everything it has.
let announced = false;

const Selection = createContext<{
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  editable: boolean;
}>({
  selectedId: null,
  issueIds: new Set(),
  editable: false,
});

const dropped = (move: Move) => post({ type: "move", move });
const resized = (blockId: string, widths: string) => post({ type: "widths", blockId, widths });
const preview = (blocks: BlockList) => update({ blocks });

// The frame is what sits in the page's grid, so it takes the block's width on the page.
function Frame({ block, definition, pageWidth, children }: BlockFrameProps) {
  const { selectedId, issueIds, editable } = useContext(Selection);
  const selected = block.id === selectedId;
  const classes = ["canvas-blocks__block"];
  const placed = pageItemClass(pageWidth);
  if (placed) classes.push(placed);
  if (selected) classes.push("canvas-blocks__block--selected");
  if (issueIds.has(block.id)) classes.push("canvas-blocks__block--problem");
  return (
    <div className={classes.join(" ")} data-block-id={block.id} data-block-label={definition.label}>
      {selected && editable ? (
        <Button
          intent="secondary"
          size="sm"
          className="canvas-blocks__grip"
          aria-label={`Drag to move this ${definition.label.toLowerCase()} block`}
          data-drag-block={block.id}
        >
          <GripVerticalIcon size={16} aria-hidden="true" />
        </Button>
      ) : null}
      {children}
    </div>
  );
}

// Text fields keep their own keys, as in the editor.
function ownsKeys(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}

export interface CanvasRendered {
  title: string;
  featuredMediaId: string;
  titleInContent: boolean;
}

export function CanvasBlocks({
  templateSlug,
  dates,
  blocks,
  data,
  rendered,
  theme,
}: {
  templateSlug: string;
  dates: DateSettings & { language: string };
  // The saved blocks, until the editor sends its own.
  blocks: BlockList;
  data: CanvasData;
  // What the server drew the layouts with.
  rendered: CanvasRendered;
  // For the background colour's palette.
  theme: Pick<SettingsValue<"theme">, "preset" | "tokens">;
}) {
  const initial = useMemo<CanvasState>(
    () => ({
      blocks,
      data,
      selectedId: null,
      issueIds: new Set(),
      editable: true,
      title: rendered.title,
      featuredMediaId: rendered.featuredMediaId,
      background: null,
    }),
    [blocks, data, rendered.title, rendered.featuredMediaId],
  );
  if (typeof window !== "undefined") state ??= initial;
  const now = useSyncExternalStore(
    subscribe,
    () => state ?? initial,
    () => initial,
  );
  const templateBlocks = use(loadCanvasBlocks(templateSlug));
  const router = useRouter();
  const nonce = useNonce();

  // Once the editor has said which background, the saved ones the server drew (the site's and
  // the page's) are off, and the editor's is drawn below. After every render: drawing the
  // layouts again can bring them back.
  useEffect(() => {
    if (now.background === null) return;
    for (const style of document.querySelectorAll<HTMLStyleElement>(
      "style[data-page-background]",
    )) {
      style.disabled = true;
    }
  });
  const backgroundCss = now.background ? pageBackgroundCss(now.background, theme) : "";
  const background = backgroundCss ? <style nonce={nonce}>{backgroundCss}</style> : null;

  // The editor's messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readToCanvas(event);
      if (!message) return;
      switch (message.type) {
        case "content":
          update({ blocks: message.blocks });
          break;
        case "data":
          update({ data: message.data });
          break;
        case "selection":
          update({
            selectedId: message.selectedId,
            issueIds: new Set(message.issueIds),
            editable: message.editable,
          });
          break;
        case "entry":
          update({
            title: message.title,
            featuredMediaId: message.featuredMediaId,
            background: message.background,
          });
          break;
        case "scrollTo": {
          const frame = document.querySelector(`[data-block-id="${CSS.escape(message.blockId)}"]`);
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          frame?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
          break;
        }
      }
    };
    window.addEventListener("message", onMessage);
    if (!announced) {
      announced = true;
      post({ type: "ready" });
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Clicks select; nothing in the page navigates or submits. Captured on the whole document,
  // so the template's header and footer links stay put too.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      // The click that ends dragging a column line (canvas-widths) keeps the selection.
      if (event.target.closest("[data-canvas-handle]")) return;
      const link = event.target.closest("a[href]");
      const submit = event.target.closest("button[type='submit'], button:not([type])");
      if (link || submit) event.preventDefault();
      const frame = event.target.closest<HTMLElement>("[data-block-id]");
      post({ type: "select", blockId: frame?.dataset.blockId ?? null });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      };
      if (!isEditorKey(key)) return;
      const save = (key.ctrlKey || key.metaKey) && key.key.toLowerCase() === "s";
      if (!save && ownsKeys(event.target)) return;
      event.preventDefault();
      post({ type: "key", key });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // The layouts are drawn on the server: when the title, the featured picture or whether a hero
  // opens the page differs from what they were drawn with, draw them again. The blocks stay.
  const heading = headingBlockId(now.blocks);
  const titleInContent = heading !== null;
  useEffect(() => {
    if (
      now.title === rendered.title &&
      now.featuredMediaId === rendered.featuredMediaId &&
      titleInContent === rendered.titleInContent
    ) {
      return;
    }
    const query = new URLSearchParams(window.location.search);
    query.set("title", now.title);
    query.set("featured", now.featuredMediaId);
    query.set("heading", titleInContent ? "1" : "0");
    const next = `${window.location.pathname}?${query}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      router.replace(next as Route, { scroll: false });
    }
  }, [now.title, now.featuredMediaId, titleInContent, rendered, router]);

  const context = useMemo<RenderContext>(
    () => ({
      media: (id) => now.data.media[id],
      href: (target) => (target.kind === "url" ? target.url : now.data.links[target.entryId]),
      posts: now.data.posts,
      editing: true,
      dates,
      headingBlockId: heading,
      image: (props) => <SiteImage {...props} />,
      templateBlock: (type) => templateBlocks[type],
    }),
    [now.data, dates, heading, templateBlocks],
  );

  if (now.blocks.length === 0) {
    return (
      <div className="canvas-blocks__empty">
        {background}
        <Empty>
          <EmptyMedia>
            <ColumnsIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>An empty page</EmptyTitle>
          <EmptyDescription>
            Add a block from Add: a heading, some text, a hero to start a landing page.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }
  return (
    <Selection.Provider
      value={{ selectedId: now.selectedId, issueIds: now.issueIds, editable: now.editable }}
    >
      {background}
      <SiteBlocks blocks={now.blocks} context={context} frame={Frame} />
      <CanvasDrag blocks={now.blocks} enabled={now.editable} onDrop={dropped} />
      <CanvasWidths
        blocks={now.blocks}
        selectedId={now.selectedId}
        enabled={now.editable}
        onPreview={preview}
        onWidths={resized}
      />
    </Selection.Provider>
  );
}
