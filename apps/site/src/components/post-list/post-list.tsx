// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { FileTextIcon } from "@nuvui/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  paginationRange,
} from "@nuvui/react";
import type { RenderMedia } from "@sitebuilder/blocks";
import type { PublicPostCard } from "@sitebuilder/db";
import { formatDate, listPagePath, type SettingsValue } from "@sitebuilder/schema";
import { SiteImage } from "@/components/site-image/site-image";
import "./post-list.scss";

// The blog index, an archive, or the home page without a home page set: one page of posts as
// cards, newest first, with nuvui's Pagination under them (design §7). Pages are addresses
// (/blog/page/2), so every page can be linked to and Back works.

export function PostList({
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
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="post-list">
      <header className="post-list__header">
        <h1 className="post-list__title">{title}</h1>
        {description ? <p className="post-list__description">{description}</p> : null}
        {pages > 1 ? (
          <p className="post-list__page">
            Page {page} of {pages}
          </p>
        ) : null}
      </header>

      {posts.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <FileTextIcon aria-hidden="true" size={24} />
          </EmptyMedia>
          <EmptyTitle>No posts yet</EmptyTitle>
          <EmptyDescription>Posts appear here once they're published.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="post-list__cards">
          {posts.map((post, index) => {
            const picture = post.featuredMediaId ? media[post.featuredMediaId] : undefined;
            return (
              <li key={post.id}>
                <Card className="post-list__card">
                  {picture?.mimeType.startsWith("image/") ? (
                    <SiteImage
                      media={picture}
                      alt=""
                      className="post-list__picture"
                      sizes="(min-width: 64rem) 22rem, (min-width: 40rem) 50vw, 100vw"
                      priority={index === 0}
                    />
                  ) : null}
                  <CardHeader>
                    <CardTitle asChild>
                      <h2>
                        <a className="post-list__link" href={post.path}>
                          {post.title}
                        </a>
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      <time dateTime={post.publishedAt.toISOString()}>
                        {formatDate(post.publishedAt, site, site.language)}
                      </time>
                    </CardDescription>
                  </CardHeader>
                  {post.excerpt ? (
                    <CardContent>
                      <p className="post-list__excerpt">{post.excerpt}</p>
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <Pagination aria-label="Pages of posts" className="post-list__pagination">
          <PaginationList>
            <PaginationItem>
              <PaginationPrevious
                disabled={page === 1}
                {...(page > 1 ? { href: listPagePath(basePath, page - 1) } : {})}
              />
            </PaginationItem>
            {paginationRange({ page, count: pages }).map((entry) => (
              <PaginationItem key={entry}>
                {typeof entry === "number" ? (
                  <PaginationLink
                    href={listPagePath(basePath, entry)}
                    aria-label={`Page ${entry}`}
                    active={entry === page}
                  >
                    {entry}
                  </PaginationLink>
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                disabled={page === pages}
                {...(page < pages ? { href: listPagePath(basePath, page + 1) } : {})}
              />
            </PaginationItem>
          </PaginationList>
        </Pagination>
      ) : null}
    </div>
  );
}
