// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScrollProgress } from "@nuvui/react";
import { can } from "@sitebuilder/auth";
import { headingBlockId } from "@sitebuilder/blocks";
import { db, getEntryForCanvas, type PublicEntry } from "@sitebuilder/db";
import { ENTRY_LIMITS, type EntryKind, Uuid } from "@sitebuilder/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { CanvasBlocks } from "@/components/canvas-blocks/canvas-blocks";
import { EntryView } from "@/components/entry-view/entry-view";
import { SiteFrame } from "@/components/site-frame/site-frame";
import { getReadingSettings, getRenderData, getSite } from "@/server/content";
import { activeTemplate } from "@/server/template";

// The editor's canvas: a page or a post as visitors will see it, drawn with the active
// template's Site and Page (or Post) layouts, for the editor in the admin zone to frame. Its
// blocks are drawn in the browser from what the editor sends (canvas-blocks.tsx). Only someone
// who may read the entry sees it ("new" for one not saved yet: someone who may create one), and
// only a page of the site may frame it (src/proxy.ts).
//
// The layouts draw the title and the featured picture, which the editor changes before they're
// saved: it sends them, and the canvas asks for this page again with them in the query.

export const metadata: Metadata = { title: "Editing", robots: { index: false, follow: false } };

// Drawn whole, per request, inside the editor: no loading state, which would flash each time the
// title redraws the layouts.
export const instant = false;

const Query = v.object({
  type: v.optional(v.picklist(["page", "post"])),
  title: v.optional(v.pipe(v.string(), v.maxLength(ENTRY_LIMITS.title))),
  featured: v.optional(v.union([v.literal(""), Uuid])),
  heading: v.optional(v.picklist(["0", "1"])),
});

// One value per key; anything else is left out, and the saved value drawn instead.
function readQuery(search: Record<string, string | string[] | undefined>) {
  const one = Object.fromEntries(
    Object.entries(search).filter((pair): pair is [string, string] => typeof pair[1] === "string"),
  );
  const parsed = v.safeParse(Query, one);
  return parsed.success ? parsed.output : {};
}

// An entry that isn't saved yet: empty, and the viewer's.
function unsaved(type: EntryKind, authorId: string): PublicEntry {
  return {
    id: "",
    type,
    status: "draft",
    title: "",
    path: "",
    excerpt: null,
    content: [],
    featuredMediaId: null,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    updatedAt: new Date(),
    authorId,
    authorName: "",
    terms: [],
  };
}

export default async function CanvasPage({ params, searchParams }: PageProps<"/_canvas/[id]">) {
  // Request time only: the build would otherwise draw it, without a session or a database.
  await connection();
  const viewer = await getViewer();
  if (!viewer) notFound();
  const { id } = await params;
  const query = readQuery(await searchParams);

  let saved: PublicEntry;
  if (id === "new") {
    const type = query.type ?? "page";
    if (!can(viewer, `${type}.create`)) notFound();
    saved = unsaved(type, viewer.id);
  } else {
    // Read fresh, not cached: the editor has just saved it.
    const found = v.is(Uuid, id) ? await getEntryForCanvas(db, id) : undefined;
    if (
      !found ||
      !can(viewer, `${found.type}.read`, { type: found.type, ownerId: found.authorId })
    ) {
      notFound();
    }
    saved = found;
  }

  const featuredMediaId =
    query.featured === undefined ? saved.featuredMediaId : query.featured || null;
  const entry: PublicEntry = { ...saved, title: query.title ?? saved.title, featuredMediaId };
  const titleInContent =
    query.heading === undefined ? headingBlockId(saved.content) !== null : query.heading === "1";

  const [site, reading, template, data] = await Promise.all([
    getSite(),
    getReadingSettings(),
    activeTemplate(),
    getRenderData(saved.content, featuredMediaId ? [featuredMediaId] : []),
  ]);
  return (
    <>
      <ScrollProgress className="canvas-blocks__progress" />
      <SiteFrame currentPath={entry.path || "/"}>
        <EntryView
          entry={entry}
          data={data}
          site={site}
          postsPath={reading.postsPath}
          // The canvas has its own bar along the top (above).
          readingProgress={false}
          titleInContent={titleInContent}
        >
          {/* Until the template's block components have loaded in the browser. */}
          <Suspense>
            <CanvasBlocks
              templateSlug={template.slug}
              dates={{
                dateFormat: site.dateFormat,
                timeZone: site.timeZone,
                language: site.language,
              }}
              blocks={saved.content}
              data={data}
              rendered={{
                title: entry.title,
                featuredMediaId: featuredMediaId ?? "",
                titleInContent,
              }}
            />
          </Suspense>
        </EntryView>
      </SiteFrame>
    </>
  );
}
