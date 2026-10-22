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
import type { ArchiveLayoutProps } from "@sitebuilder/template-sdk";
import Image from "next/image";

// The blog, a category or a tag, or the home page when none is set: one page of posts as cards,
// newest first, with nuvui's Pagination under them. Pages are addresses (/blog/page/2), so
// every page can be linked to and Back works.

export default function Archive({ title, description, posts, pagination }: ArchiveLayoutProps) {
  const { page, pages } = pagination;
  const pageHref = (number: number) => pagination.links.find((link) => link.page === number)?.href;

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
          {posts.map((post, index) => (
            <li key={post.id}>
              <Card className="post-list__card">
                {post.image?.width && post.image.height ? (
                  <Image
                    src={post.image.src}
                    width={post.image.width}
                    height={post.image.height}
                    // The title beside it says what it is.
                    alt=""
                    className="post-list__picture"
                    sizes="(min-width: 64rem) 22rem, (min-width: 40rem) 50vw, 100vw"
                    {...(index === 0 ? { loading: "eager", fetchPriority: "high" } : {})}
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
                  {post.published ? (
                    <CardDescription>
                      <time dateTime={post.published.iso}>{post.published.text}</time>
                    </CardDescription>
                  ) : null}
                </CardHeader>
                {post.excerpt ? (
                  <CardContent>
                    <p className="post-list__excerpt">{post.excerpt}</p>
                  </CardContent>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <Pagination aria-label="Pages of posts" className="post-list__pagination">
          <PaginationList>
            <PaginationItem>
              <PaginationPrevious
                disabled={pagination.previous === null}
                {...(pagination.previous ? { href: pagination.previous } : {})}
              />
            </PaginationItem>
            {paginationRange({ page, count: pages }).map((entry) => (
              <PaginationItem key={entry}>
                {typeof entry === "number" ? (
                  <PaginationLink
                    href={pageHref(entry)}
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
                disabled={pagination.next === null}
                {...(pagination.next ? { href: pagination.next } : {})}
              />
            </PaginationItem>
          </PaginationList>
        </Pagination>
      ) : null}
    </div>
  );
}
