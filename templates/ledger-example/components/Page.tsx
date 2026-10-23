// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { PageLayoutProps } from "@sitebuilder/template-sdk";

// A page: its title and summary, ruled off unless the option says not to, then its blocks,
// which the site draws in the page's grid at the template's width.
export default function Page({ entry, titleInContent, options, children }: PageLayoutProps) {
  const ruled = options.ruled !== false;
  return (
    <article className={ruled ? "ledger-page ledger-page--ruled" : "ledger-page"}>
      {titleInContent ? null : (
        <header className="ledger-page__header">
          <h1 className="ledger-page__title">{entry.title}</h1>
          {entry.excerpt ? <p className="ledger-page__lead">{entry.excerpt}</p> : null}
        </header>
      )}
      {children}
    </article>
  );
}
