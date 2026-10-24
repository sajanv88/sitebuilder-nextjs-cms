// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  type CanvasData,
  type CanvasKey,
  canvasMessage,
  readFromCanvas,
  type ToCanvas,
} from "@sitebuilder/blocks";
import type { BlockList } from "@sitebuilder/schema";
import {
  type CSSProperties,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditorData } from "@/components/block-editor/editor-data";
import "./block-canvas.scss";

// The page as visitors will see it (design §8): an iframe of the site zone's canvas
// (/_canvas/<entryId>), which draws the active template's layouts on the server and the blocks
// in the browser, from what this sends on every change. Clicking a block there selects it here,
// and the editor's shortcuts pressed there work here. Links and buttons in it don't navigate.
//
// Each device is a window of its width, so the page's media queries and the blocks' container
// queries both see that size. "Fit" is the pane's own width. A frame wider than the pane is
// drawn smaller to fit, and says how much smaller; it keeps its width, so its layout doesn't
// change, and it's drawn taller in proportion, so it still fills the pane's height.

export type Device = "fit" | "desktop" | "tablet" | "phone";

// A laptop's window, an iPad's in portrait, an iPhone's.
const WIDTHS: Record<Exclude<Device, "fit">, number> = {
  desktop: 1280,
  tablet: 768,
  phone: 390,
};

// The title and featured picture go after a pause in typing: the canvas draws its layouts on
// the server again for them.
const ENTRY_DELAY = 300;

export interface CanvasHandle {
  // Bring a block into the middle of the canvas.
  scrollTo: (blockId: string) => void;
}

// How much smaller the frame is drawn, and the height it then needs to fill the viewport, from
// the viewport's size and the frame's width. Re-measured whenever the viewport changes size.
function useFit(viewport: React.RefObject<HTMLDivElement | null>, width: number | null) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [viewport]);
  const scale = width && box.width > 0 ? Math.min(1, box.width / width) : 1;
  return { scale, height: box.height / scale };
}

// The editor's own shortcuts, pressed in the canvas: handed to the editor as if pressed here.
function pressKey(key: CanvasKey) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }));
}

export function BlockCanvas({
  ref,
  src,
  label,
  blocks,
  selectedId,
  issueIds,
  onSelect,
  title,
  featuredMediaId,
  background,
  device = "fit",
}: {
  ref?: Ref<CanvasHandle>;
  // The canvas page for this entry, fixed when the editor opens.
  src: string;
  // The frame's name, for screen readers.
  label: string;
  blocks: BlockList;
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  title: string;
  featuredMediaId: string;
  // "#rrggbb", or "" for the theme's.
  background: string;
  device?: Device;
}) {
  const { media, links, posts } = useEditorData();
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const width = device === "fit" ? null : WIDTHS[device];
  const fit = useFit(viewport, width);
  const scaled = fit.scale < 0.995;
  // How many times the canvas has loaded and said it's ready: each time, it's sent everything.
  const [loads, setLoads] = useState(0);

  const send = useCallback((message: ToCanvas) => {
    frame.current?.contentWindow?.postMessage(canvasMessage(message), window.location.origin);
  }, []);

  useImperativeHandle(ref, () => ({ scrollTo: (blockId) => send({ type: "scrollTo", blockId }) }), [
    send,
  ]);

  // The canvas's messages: it's ready (after every load), a block was clicked, a key pressed.
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readFromCanvas(event, frame.current);
      if (!message) return;
      if (message.type === "ready") setLoads((n) => n + 1);
      else if (message.type === "select") select.current(message.blockId);
      else pressKey(message.key);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // What the blocks point at, with entries' paths by id: drafts' too, since a link to a draft
  // still draws in the editor, to its path (it isn't live yet anyway).
  const data = useMemo<CanvasData>(
    () => ({
      media,
      links: Object.fromEntries(Object.values(links).map((link) => [link.id, link.path])),
      posts,
    }),
    [media, links, posts],
  );

  // Each kind of message when its part changes, and all of them once the canvas is ready.
  useEffect(() => {
    if (loads > 0) send({ type: "data", data });
  }, [loads, send, data]);
  useEffect(() => {
    if (loads > 0) send({ type: "content", blocks });
  }, [loads, send, blocks]);
  useEffect(() => {
    if (loads > 0) send({ type: "selection", selectedId, issueIds: [...issueIds] });
  }, [loads, send, selectedId, issueIds]);
  // At once after a load; after a pause while it's being typed.
  const entryLoad = useRef(0);
  useEffect(() => {
    if (loads === 0) return;
    const message: ToCanvas = { type: "entry", title, featuredMediaId, background };
    if (entryLoad.current !== loads) {
      entryLoad.current = loads;
      send(message);
      return;
    }
    const timer = setTimeout(() => send(message), ENTRY_DELAY);
    return () => clearTimeout(timer);
  }, [loads, send, title, featuredMediaId, background]);

  return (
    <div className="block-canvas">
      {/* On a line of its own, so it covers nothing in the page. */}
      {scaled ? (
        <p className="block-canvas__scale">{`Shown at ${Math.round(fit.scale * 100)}% to fit`}</p>
      ) : null}
      <div ref={viewport} className="block-canvas__viewport">
        <iframe
          ref={frame}
          src={src}
          title={label}
          className="block-canvas__frame"
          style={
            {
              inlineSize: width ? `${width}px` : "100%",
              blockSize: `${fit.height}px`,
              ...(scaled ? { transform: `scale(${fit.scale})` } : {}),
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}
