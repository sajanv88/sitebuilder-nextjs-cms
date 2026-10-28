// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ArrowLeftIcon, ArrowRightIcon } from "@nuvui/icons";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DocPage, hrefOf } from "@/docs/nav";
import { PageContents } from "./page-contents";
import "./docs-page.scss";

// The start page, typed as a route: TypeScript 7 sometimes rejects the literal "/" in a
// Link's href, depending on the order it checks files in (decisions #153).
const HOME: Route = "/";

// One page of the documentation, after nuvui's article block: where it sits, its title and
// what it covers, the text, the way on to the next page, and its headings beside it on a wide
// screen (behind a button on a narrow one).
export function DocsPage({
  section,
  title,
  description,
  previous,
  next,
  children,
}: {
  // Null on the home page, which sits in no section.
  section: string | null;
  title: string;
  description: string;
  previous: DocPage | null;
  next: DocPage | null;
  children: ReactNode;
}) {
  return (
    <div className="docs-page">
      <article className="docs-page__main">
        <header className="docs-page__head">
          {section ? (
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={HOME}>Docs</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{section}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
          <h1 className="docs-page__title">{title}</h1>
          <p className="docs-page__lead">{description}</p>
        </header>

        <PageContents variant="drawer" />

        <div className="docs-page__body" data-docs-body="">
          {children}
        </div>

        {previous || next ? (
          <nav className="docs-page__pager" aria-label="Previous and next page">
            {previous ? (
              <Link className="docs-page__step" href={hrefOf(previous.slug) as Route}>
                <span className="docs-page__step-label">
                  <ArrowLeftIcon aria-hidden="true" size={16} /> Previous
                </span>
                <span className="docs-page__step-title">{previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                className="docs-page__step docs-page__step--next"
                href={hrefOf(next.slug) as Route}
              >
                <span className="docs-page__step-label docs-page__step-label--end">
                  Next <ArrowRightIcon aria-hidden="true" size={16} />
                </span>
                <span className="docs-page__step-title">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </article>

      <aside className="docs-page__side">
        <PageContents variant="side" />
      </aside>
    </div>
  );
}
