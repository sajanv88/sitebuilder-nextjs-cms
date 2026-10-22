// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { RenderContext } from "@sitebuilder/blocks";
import type { SettingsValue } from "@sitebuilder/schema";
import type { LoadedTemplate } from "@sitebuilder/templates/site";
import { SiteImage } from "@/components/site-image/site-image";
import type { RenderData } from "./content";

// What blocks read while the site draws them: files and links from the page's render data,
// dates in the site's format and zone, next/image for pictures, and the active template's own
// blocks' components (another template's blocks draw nothing).
export function siteContext(
  data: RenderData,
  site: SettingsValue<"site">,
  headingBlockId: string | null,
  template: LoadedTemplate,
): RenderContext {
  return {
    media: (id) => data.media[id],
    // Entries that aren't public aren't in `links`, so links to them draw nothing.
    href: (target) => (target.kind === "url" ? target.url : data.links[target.entryId]),
    posts: data.posts,
    editing: false,
    dates: { dateFormat: site.dateFormat, timeZone: site.timeZone, language: site.language },
    headingBlockId,
    image: (props) => <SiteImage {...props} />,
    templateBlock: (type) => template.blocks[type],
  };
}
