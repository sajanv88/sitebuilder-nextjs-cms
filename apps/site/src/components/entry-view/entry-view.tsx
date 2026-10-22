// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScrollProgress } from "@nuvui/react";
import { BlockList, headingBlockId } from "@sitebuilder/blocks";
import type { PublicEntry } from "@sitebuilder/db";
import { archivePath, formatDate, type SettingsValue, TAXONOMIES } from "@sitebuilder/schema";
import { SiteImage } from "@/components/site-image/site-image";
import type { RenderData } from "@/server/content";
import { siteContext } from "@/server/render-context";
import "./entry-view.scss";

// The one template of v1 (design §7), for pages and posts: the title as the h1, unless a hero
// opens the page and takes it (decisions #68), then the blocks. A post adds its date and
// author, its featured image, its categories and tags as links to their archives, and, unless
// Settings → Reading turns it off, a bar along the top of the window that fills as it's read.

const TAXONOMY_NAMES = { category: "Categories", tag: "Tags" } as const;

export function EntryView({
  entry,
  data,
  site,
  postsPath,
  readingProgress,
}: {
  entry: PublicEntry;
  data: RenderData;
  site: SettingsValue<"site">;
  postsPath: string;
  readingProgress: boolean;
}) {
  const heading = headingBlockId(entry.content);
  const context = siteContext(data, site, heading);
  const isPost = entry.type === "post";
  const featured = entry.featuredMediaId ? data.media[entry.featuredMediaId] : undefined;

  return (
    <article className={`entry entry--${entry.type}`}>
      {isPost && readingProgress ? <ScrollProgress className="entry__progress" /> : null}
      {heading === null || isPost ? (
        <header className="entry__header">
          {heading === null ? <h1 className="entry__title">{entry.title}</h1> : null}
          {isPost && entry.publishedAt ? (
            <p className="entry__meta">
              <time dateTime={entry.publishedAt.toISOString()}>
                {formatDate(entry.publishedAt, site, site.language)}
              </time>
              <span aria-hidden="true"> · </span>
              {entry.authorName}
            </p>
          ) : null}
        </header>
      ) : null}

      {isPost && featured?.mimeType.startsWith("image/") ? (
        <div className="entry__featured">
          <SiteImage
            media={featured}
            alt={featured.alt ?? ""}
            className="entry__featured-img"
            sizes="(min-width: 48rem) 48rem, 100vw"
            priority={heading === null}
          />
        </div>
      ) : null}

      <div className="entry__content">
        <BlockList blocks={entry.content} context={context} />
      </div>

      {isPost && entry.terms.length > 0 ? (
        <footer className="entry__footer">
          {TAXONOMIES.map((taxonomy) => {
            const terms = entry.terms.filter((term) => term.taxonomy === taxonomy);
            if (terms.length === 0) return null;
            return (
              <div key={taxonomy} className="entry__terms">
                <h2 className="entry__terms-label">{TAXONOMY_NAMES[taxonomy]}</h2>
                <ul className="entry__term-list">
                  {terms.map((term) => (
                    <li key={term.id}>
                      <a
                        className="entry__term"
                        href={archivePath(postsPath, term.taxonomy, term.slug)}
                      >
                        {term.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </footer>
      ) : null}
    </article>
  );
}
