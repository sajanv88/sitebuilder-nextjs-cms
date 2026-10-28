// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ChevronDownIcon } from "@nuvui/icons";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TableOfContents,
  type TableOfContentsItem,
} from "@nuvui/react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

// The page's headings as a list that marks the one being read. Read from the page once it's
// drawn: the headings are the MDX's own, given ids by mdx-components.tsx. A page with fewer
// than three is its own table of contents, so it gets none.
function useHeadings(): TableOfContentsItem[] {
  const pathname = usePathname();
  const [items, setItems] = useState<TableOfContentsItem[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: read again on every new page.
  useEffect(() => {
    const headings = document.querySelectorAll<HTMLHeadingElement>(
      "[data-docs-body] h2[id], [data-docs-body] h3[id]",
    );
    setItems(
      Array.from(headings, (heading) => ({
        id: heading.id,
        title: heading.textContent ?? "",
        depth: heading.tagName === "H2" ? 1 : 2,
      })),
    );
  }, [pathname]);

  return items.length >= 3 ? items : [];
}

export function PageContents({ variant }: { variant: "side" | "drawer" }) {
  const items = useHeadings();
  const labelId = useId();
  if (items.length === 0) return null;

  // On a narrow screen the same list is behind a button, above the text.
  if (variant === "drawer") {
    return (
      <Collapsible className="docs-page__drawer">
        <CollapsibleTrigger asChild>
          <Button intent="secondary" className="docs-page__toggle">
            On this page
            <ChevronDownIcon aria-hidden="true" size={16} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <TableOfContents
            aria-label="On this page"
            items={items}
            offset={80}
            className="docs-page__drawer-list"
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <>
      <p className="docs-page__side-label" id={labelId}>
        On this page
      </p>
      <TableOfContents aria-labelledby={labelId} items={items} offset={80} />
    </>
  );
}
