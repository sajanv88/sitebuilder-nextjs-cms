// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import type { PostSummary, RenderMedia } from "@sitebuilder/blocks";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { LinkOption } from "@/actions/entry-editor";

// What the editor knows beyond the blocks: the files and entries they point at (so the canvas
// can draw them and the inspector can name them), the latest posts, the terms, and whether the
// viewer may upload. The server sends what the saved blocks use; picking more adds to it. The
// canvas sends the files, links and posts on to the page it frames (block-canvas.tsx).

export interface EditorData {
  media: Record<string, RenderMedia>;
  links: Record<string, LinkOption>;
  posts: PostSummary[];
  terms: { id: string; name: string; taxonomy: "category" | "tag" }[];
  upload: { allowed: boolean; maxBytes: number };
  // Who's editing: the browser keeps their pinned blocks under it.
  userId: string;
  // The active template: its own blocks are offered in the inserter.
  templateSlug: string;
}

interface EditorDataValue extends EditorData {
  addMedia: (items: RenderMedia[]) => void;
  addLink: (link: LinkOption) => void;
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

  const value = useMemo<EditorDataValue>(
    () => ({ ...initial, media, links, addMedia, addLink }),
    [initial, media, links, addMedia, addLink],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEditorData(): EditorDataValue {
  const value = useContext(Context);
  if (!value) throw new Error("useEditorData needs an EditorDataProvider");
  return value;
}
