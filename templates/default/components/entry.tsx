// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScrollProgress } from "@nuvui/react";
import type { PageLayoutProps, TermLink } from "@sitebuilder/template-sdk";
import Image from "next/image";

// Pages and posts: the title as the h1, unless a hero opens the page and takes it, then the
// blocks. A post adds its date and author, its featured picture, its categories and tags as
// links to their archives, and, unless Settings → Reading turns it off, a bar along the top of
// the window that fills as it's read.

const TAXONOMIES = [
  { taxonomy: "category", label: "Categories" },
  { taxonomy: "tag", label: "Tags" },
] as const;

export function Entry({
  entry,
  titleInContent,
  children,
  terms = [],
  readingProgress = false,
}: PageLayoutProps & { terms?: readonly TermLink[]; readingProgress?: boolean }) {
  const isPost = entry.type === "post";
  const featured = isPost ? entry.featured : null;

  return (
    <article className={`entry entry--${entry.type}`}>
      {isPost && readingProgress ? <ScrollProgress className="entry__progress" /> : null}
      {!titleInContent || isPost ? (
        <header className="entry__header">
          {titleInContent ? null : <h1 className="entry__title">{entry.title}</h1>}
          {isPost && entry.published ? (
            <p className="entry__meta">
              <time dateTime={entry.published.iso}>{entry.published.text}</time>
              {entry.authorName ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {entry.authorName}
                </>
              ) : null}
            </p>
          ) : null}
        </header>
      ) : null}

      {featured?.width && featured.height ? (
        <div className="entry__featured">
          <Image
            src={featured.src}
            width={featured.width}
            height={featured.height}
            alt={featured.alt}
            className="entry__featured-img"
            sizes="(min-width: 48rem) 48rem, 100vw"
            // Near the top of the page unless a hero comes first.
            {...(titleInContent ? {} : { loading: "eager", fetchPriority: "high" })}
          />
        </div>
      ) : null}

      {children}

      {isPost && terms.length > 0 ? (
        <footer className="entry__footer">
          {TAXONOMIES.map(({ taxonomy, label }) => {
            const links = terms.filter((term) => term.taxonomy === taxonomy);
            if (links.length === 0) return null;
            return (
              <div key={taxonomy} className="entry__terms">
                <h2 className="entry__terms-label">{label}</h2>
                <ul className="entry__term-list">
                  {links.map((term) => (
                    <li key={term.href}>
                      <a className="entry__term" href={term.href}>
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
