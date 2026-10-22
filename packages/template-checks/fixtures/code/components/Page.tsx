// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { PageLayoutProps } from "@sitebuilder/template-sdk";

export default function Page({ entry, titleInContent, children }: PageLayoutProps) {
  // A local named fetch isn't the global one.
  const fetch = (path: string) => path.length;
  return (
    <article data-length={fetch(entry.path)}>
      {titleInContent ? null : <h1>{entry.title}</h1>}
      {children}
    </article>
  );
}
