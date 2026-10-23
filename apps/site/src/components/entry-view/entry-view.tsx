// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { headingBlockId } from "@sitebuilder/blocks";
import type { PublicEntry } from "@sitebuilder/db";
import type { SettingsValue } from "@sitebuilder/schema";
import type { ReactNode } from "react";
import { SiteBlocks } from "@/components/site-blocks/site-blocks";
import type { RenderData } from "@/server/content";
import { entryInfo, siteInfo, termLinks } from "@/server/layout-props";
import { siteContext } from "@/server/render-context";
import { activeTemplate } from "@/server/template";

// A page or a post, drawn with the template's Page or Post layout around its blocks. A hero
// that opens the page holds its h1 (decisions #68), and the layout is told so. The editor's
// canvas passes its own blocks, drawn in the browser, and says whether a hero opens them.
export async function EntryView({
  entry,
  data,
  site,
  postsPath,
  readingProgress,
  children,
  titleInContent,
}: {
  entry: PublicEntry;
  data: RenderData;
  site: SettingsValue<"site">;
  postsPath: string;
  readingProgress: boolean;
  children?: ReactNode;
  titleInContent?: boolean;
}) {
  const template = await activeTemplate();
  const { layouts, options } = template;
  const heading = headingBlockId(entry.content);
  const blocks = children ?? (
    <SiteBlocks blocks={entry.content} context={siteContext(data, site, heading, template)} />
  );
  const props = {
    site: siteInfo(site),
    entry: entryInfo(entry, data, site),
    titleInContent: titleInContent ?? heading !== null,
    options,
  };

  if (entry.type === "post") {
    const Post = layouts.post;
    return (
      <Post {...props} terms={termLinks(entry, postsPath)} readingProgress={readingProgress}>
        {blocks}
      </Post>
    );
  }
  const Page = layouts.page;
  return <Page {...props}>{blocks}</Page>;
}
