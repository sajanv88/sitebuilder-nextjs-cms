// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Skeleton, VisuallyHidden } from "@nuvui/react";
import "./page-skeleton.scss";

// What a page shows while it's on the way, inside the site's header and footer: gray boxes in
// the site's own layout, a list of cards for the blog and its archives, or a title and lines
// of text for an entry. Most pages come from the cache and never show it.

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

export function PageSkeleton({ kind, label }: { kind: "list" | "entry"; label: string }) {
  return (
    <div className="page-skeleton" aria-busy="true">
      <Skeleton className="page-skeleton__title" />
      {kind === "list" ? (
        <ul className="page-skeleton__cards">
          {range(6).map((card) => (
            <li key={card} className="page-skeleton__card">
              <Skeleton className="page-skeleton__picture" />
              <Skeleton shape="text" className="page-skeleton__line" />
              <Skeleton shape="text" className="page-skeleton__line page-skeleton__line--short" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="page-skeleton__text">
          <Skeleton shape="text" className="page-skeleton__line page-skeleton__line--short" />
          {range(6).map((line) => (
            <Skeleton key={line} shape="text" className="page-skeleton__line" />
          ))}
        </div>
      )}
      <VisuallyHidden role="status">{label}</VisuallyHidden>
    </div>
  );
}
