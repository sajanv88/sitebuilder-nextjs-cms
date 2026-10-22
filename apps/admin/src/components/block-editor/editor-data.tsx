// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import type { PostSummary, RenderContext, RenderMedia } from "@sitebuilder/blocks";
import type { LinkTarget } from "@sitebuilder/schema";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { LinkOption } from "@/actions/entry-editor";
import { useDateSettings } from "@/components/date-settings/date-settings";

// What the editor knows beyond the blocks: the files and entries they point at (so the canvas
// can draw them and the inspector can name them), the latest posts, the terms, and whether the
// viewer may upload. The server sends what the saved blocks use; picking more adds to it.

export interface EditorData {
  media: Record<string, RenderMedia>;
  links: Record<string, LinkOption>;
  posts: PostSummary[];
  terms: { id: string; name: string; taxonomy: "category" | "tag" }[];
  upload: { allowed: boolean; maxBytes: number };
  // Who's editing: the browser keeps their pinned blocks under it.
  userId: string;
}

interface EditorDataValue extends EditorData {
  addMedia: (items: RenderMedia[]) => void;
  addLink: (link: LinkOption) => void;
  // For the canvas: blocks look files and links up through this.
  context: RenderContext;
}

const Context = createContext<EditorDataValue | null>(null);

export function EditorDataProvider({
  initial,
  children,
}: {
  initial: EditorData;
  children: ReactNode;
}) {
  const [media, setMedia] = useState(initial.media);
  const [links, setLinks] = useState(initial.links);

  const addMedia = useCallback((items: RenderMedia[]) => {
    setMedia((now) => ({ ...now, ...Object.fromEntries(items.map((item) => [item.id, item])) }));
  }, []);
  const addLink = useCallback((link: LinkOption) => {
    setLinks((now) => ({ ...now, [link.id]: link }));
  }, []);

  const dates = useDateSettings();
  const value = useMemo<EditorDataValue>(() => {
    const context: RenderContext = {
      media: (id) => media[id],
      // In the editor a link to a draft still draws, to its path: it isn't live yet anyway.
      href: (target: LinkTarget) =>
        target.kind === "url" ? target.url : links[target.entryId]?.path,
      posts: initial.posts,
      editing: true,
      dates,
      // The canvas sets it from the blocks it draws (block-canvas.tsx).
      headingBlockId: null,
    };
    return { ...initial, media, links, addMedia, addLink, context };
  }, [initial, media, links, addMedia, addLink, dates]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEditorData(): EditorDataValue {
  const value = useContext(Context);
  if (!value) throw new Error("useEditorData needs an EditorDataProvider");
  return value;
}
