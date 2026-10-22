// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { RenderMedia } from "@sitebuilder/blocks";
import type { PublicPostCard } from "@sitebuilder/db";
import type { SettingsValue } from "@sitebuilder/schema";
import { pagination, postCards, siteInfo } from "@/server/layout-props";
import { activeTemplate } from "@/server/template";

// The blog index, an archive, or the home page without a home page set: one page of posts,
// drawn with the template's Archive layout (design §7).
export async function PostList({
  kind,
  title,
  description,
  posts,
  total,
  page,
  perPage,
  basePath,
  media,
  site,
}: {
  kind: "posts" | "category" | "tag";
  title: string;
  description?: string | undefined;
  posts: PublicPostCard[];
  total: number;
  page: number;
  perPage: number;
  basePath: string;
  media: Record<string, RenderMedia>;
  site: SettingsValue<"site">;
}) {
  const { layouts, options } = await activeTemplate();
  const Archive = layouts.archive;
  return (
    <Archive
      site={siteInfo(site)}
      kind={kind}
      title={title}
      description={description ?? null}
      posts={postCards(posts, media, site)}
      pagination={pagination(page, total, perPage, basePath)}
      options={options}
    />
  );
}
