// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Button, Field, FieldControl, FieldLabel, Input } from "@nuvui/react";
import type { SearchHit } from "@sitebuilder/db";
import { SEARCH_PATH } from "@sitebuilder/schema";
import "./site-search.scss";

// The search page's content, inside the template's frame (decisions #144): the form, what was
// found, best first, and the way to the next page of it. A plain GET form, so it works without
// scripts and a search can be bookmarked or shared.

const pageHref = (text: string, page: number) =>
  `${SEARCH_PATH}?${new URLSearchParams({ q: text, ...(page > 1 ? { page: String(page) } : {}) })}`;

export function SiteSearch({
  text,
  page,
  rows,
  total,
  perPage,
}: {
  // What was searched for, trimmed; "" before a search.
  text: string;
  page: number;
  rows: readonly SearchHit[];
  total: number;
  perPage: number;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="site-search">
      <h1 className="site-search__title">Search</h1>
      <search>
        <form action={SEARCH_PATH} method="get" className="site-search__form">
          <Field className="site-search__field">
            <FieldLabel>Search the site</FieldLabel>
            <FieldControl>
              <Input type="search" name="q" defaultValue={text} maxLength={200} />
            </FieldControl>
          </Field>
          <Button type="submit">Search</Button>
        </form>
      </search>

      {text ? (
        <p className="site-search__count" role="status">
          {total === 0
            ? `Nothing matches “${text}”. Try fewer words, or other ones.`
            : `${total} ${total === 1 ? "result" : "results"} for “${text}”${pages > 1 ? `, page ${page} of ${pages}` : ""}`}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ol className="site-search__results">
          {rows.map((row) => (
            <li key={row.id} className="site-search__result">
              <h2 className="site-search__result-title">
                <a href={row.path} className="site-search__link">
                  {row.title}
                </a>
              </h2>
              <p className="site-search__path">{row.path}</p>
              {row.summary ? <p className="site-search__summary">{row.summary}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {pages > 1 ? (
        <nav aria-label="Pages of results" className="site-search__pages">
          {page > 1 ? (
            <Button asChild intent="secondary">
              <a href={pageHref(text, page - 1)} rel="prev">
                Previous
              </a>
            </Button>
          ) : null}
          {page < pages ? (
            <Button asChild intent="secondary">
              <a href={pageHref(text, page + 1)} rel="next">
                Next
              </a>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
