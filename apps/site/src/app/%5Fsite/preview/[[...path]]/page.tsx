// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { db, getEntryForPreview } from "@sitebuilder/db";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getViewer } from "@/auth/session";
import { EntryView } from "@/components/entry-view/entry-view";
import { PreviewBar } from "@/components/preview-bar/preview-bar";
import { getReadingSettings, getRenderData, getSite } from "@/server/content";

// An unpublished entry, for someone allowed to read it in the admin (design §7, decisions
// #66). The proxy sends a path here only in draft mode and only when nothing public is there.
// In draft mode the cached reads run fresh, so the preview shows the latest save.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: PageProps<"/_site/preview/[[...path]]">) {
  const { isEnabled } = await draftMode();
  if (!isEnabled) notFound();
  const viewer = await getViewer();
  if (!viewer) notFound();

  const segments = (await params).path ?? [];
  const path = `/${segments.join("/")}`;
  const entry = await getEntryForPreview(db, path);
  if (!entry || !can(viewer, `${entry.type}.read`, { type: entry.type, ownerId: entry.authorId })) {
    notFound();
  }

  const [site, reading, data] = await Promise.all([
    getSite(),
    getReadingSettings(),
    getRenderData(entry.content, entry.featuredMediaId ? [entry.featuredMediaId] : []),
  ]);
  return (
    <>
      <PreviewBar status={entry.status} path={path} />
      <EntryView entry={entry} data={data} site={site} postsPath={reading.postsPath} />
    </>
  );
}
