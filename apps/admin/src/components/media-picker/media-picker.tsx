// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { CheckIcon, FileTextIcon, VideoIcon } from "@nuvui/icons";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@nuvui/react";
import type { RenderMedia } from "@sitebuilder/blocks";
import { MEDIA_TYPES, type MediaKind } from "@sitebuilder/schema";
import { useEffect, useState } from "react";
import { listMediaPage, type MediaItem } from "@/actions/media";
import { MediaUploader, type UploadedMedia } from "@/components/media-uploader/media-uploader";
import "./media-picker.scss";

// Choosing files from the media library for a block or a featured image: the library with a
// search, or an upload, in one dialog. What's chosen is handed back as RenderMedia, so the
// canvas can draw it at once.

const toRender = (item: MediaItem | UploadedMedia): RenderMedia => ({
  id: item.id,
  url: item.url,
  mimeType: item.mimeType as RenderMedia["mimeType"],
  width: item.width,
  height: item.height,
  alt: "alt" in item ? item.alt : null,
  filename: item.filename,
  sizeBytes: item.sizeBytes,
});

const ONE: Record<MediaKind | "any", string> = {
  image: "Choose an image",
  video: "Choose a video",
  document: "Choose a document",
  font: "Choose a font file",
  any: "Choose a file",
};

function Thumb({ item }: { item: MediaItem }) {
  if (MEDIA_TYPES[item.mimeType] === "image") {
    // biome-ignore lint/performance/noImgElement: files are served by the site zone at /media/ (decisions #58).
    return <img className="media-picker__img" src={item.url} alt="" loading="lazy" />;
  }
  const Icon = MEDIA_TYPES[item.mimeType] === "video" ? VideoIcon : FileTextIcon;
  return (
    <span className="media-picker__img media-picker__img--icon">
      <Icon aria-hidden="true" size={24} />
    </span>
  );
}

export function MediaPicker({
  open,
  onOpenChange,
  accept,
  multiple = false,
  upload,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accept: MediaKind | "any";
  multiple?: boolean;
  upload: { allowed: boolean; maxBytes: number };
  onPick: (media: RenderMedia[]) => void;
}) {
  const [tab, setTab] = useState("library");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<MediaItem[]>([]);

  // A new search starts from the first page; "Show more" adds the next.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      listMediaPage({
        kind: accept === "any" ? "all" : accept,
        q,
        page: String(page),
        size: "20",
      }).then((result) => {
        if (!current) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        setTotal(result.total);
        setItems((now) => (page === 1 ? result.items : [...now, ...result.items]));
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, q, page, accept]);

  useEffect(() => {
    if (!open) {
      setChosen([]);
      setQ("");
      setPage(1);
      setTab("library");
    }
  }, [open]);

  function toggle(item: MediaItem) {
    if (!multiple) {
      onPick([toRender(item)]);
      onOpenChange(false);
      return;
    }
    setChosen((now) =>
      now.some((c) => c.id === item.id) ? now.filter((c) => c.id !== item.id) : [...now, item],
    );
  }

  const noun = accept === "image" ? "images" : accept === "video" ? "videos" : "files";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{multiple ? `Choose ${noun}` : ONE[accept]}</DialogTitle>
          <DialogDescription>From the media library, or upload new ones.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Tabs value={tab} onValueChange={setTab} className="media-picker">
            <TabsList>
              <TabsTrigger value="library">Library</TabsTrigger>
              {upload.allowed ? <TabsTrigger value="upload">Upload</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="library" className="media-picker__panel">
              <Field>
                <FieldLabel>Search</FieldLabel>
                <FieldControl>
                  <Input
                    type="search"
                    value={q}
                    onChange={(event) => {
                      setQ(event.currentTarget.value);
                      setPage(1);
                    }}
                    placeholder="File name or alt text"
                  />
                </FieldControl>
              </Field>
              {error ? <p role="alert">{error}</p> : null}
              {items.length === 0 && !loading ? (
                <Empty>
                  <EmptyTitle>No {noun} found</EmptyTitle>
                  <EmptyDescription>
                    {upload.allowed
                      ? "Upload some on the Upload tab."
                      : "Ask someone who can upload to add some."}
                  </EmptyDescription>
                </Empty>
              ) : (
                <ul className="media-picker__grid" aria-label={`The media library's ${noun}`}>
                  {items.map((item) => {
                    const picked = chosen.some((c) => c.id === item.id);
                    return (
                      <li key={item.id}>
                        <Button
                          intent={picked ? "secondary" : "ghost"}
                          className="media-picker__item"
                          aria-pressed={multiple ? picked : undefined}
                          onClick={() => toggle(item)}
                        >
                          <Thumb item={item} />
                          <span className="media-picker__name">{item.filename}</span>
                          {picked ? (
                            <CheckIcon
                              aria-hidden="true"
                              size={16}
                              className="media-picker__check"
                            />
                          ) : null}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="media-picker__more">
                {loading ? <Spinner size="sm" label={`Loading ${noun}`} /> : null}
                {!loading && items.length < total ? (
                  <Button intent="secondary" onClick={() => setPage((n) => n + 1)}>
                    Show more
                  </Button>
                ) : null}
              </div>
            </TabsContent>
            {upload.allowed ? (
              <TabsContent value="upload" className="media-picker__panel">
                <MediaUploader
                  maxBytes={upload.maxBytes}
                  accept={
                    accept === "image" || accept === "video" || accept === "font" ? accept : "any"
                  }
                  onUploaded={(media) => {
                    const fitting = media.filter((m) => accept === "any" || m.kind === accept);
                    if (fitting.length === 0) return;
                    onPick(multiple ? fitting.map(toRender) : fitting.slice(0, 1).map(toRender));
                    onOpenChange(false);
                  }}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </DialogBody>
        {multiple ? (
          <DialogFooter>
            <Button intent="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={chosen.length === 0}
              onClick={() => {
                onPick(chosen.map(toRender));
                onOpenChange(false);
              }}
            >
              {chosen.length > 1 ? `Add ${chosen.length} ${noun}` : `Add`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
