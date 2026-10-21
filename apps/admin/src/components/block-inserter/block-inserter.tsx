// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nuvui/react";
import { BLOCKS, type BlockCategory } from "@sitebuilder/blocks";
import "./block-inserter.scss";

// The block types to add, searchable (design §8: a searchable inserter). A new block goes inside
// the selected block when that's a container that takes it, otherwise after it.

const GROUPS: { category: BlockCategory; heading: string }[] = [
  { category: "text", heading: "Text" },
  { category: "media", heading: "Media" },
  { category: "layout", heading: "Layout" },
  { category: "marketing", heading: "Marketing" },
  { category: "data", heading: "Lists and tables" },
];

// Names before descriptions, and words, not scattered letters: Command's own loose match puts
// Callout above Columns for "columns", from letters spread through Callout's description.
function rank(value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const name = (keywords?.[0] ?? value).toLowerCase();
  if (name.startsWith(query)) return 1;
  if (name.includes(query) || value.includes(query)) return 0.8;
  return (keywords?.[1] ?? "").toLowerCase().includes(query) ? 0.3 : 0;
}

export function BlockInserter({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <div className="block-inserter">
      <p className="block-inserter__hint">
        Added after the selected block, or inside it when it holds blocks.
      </p>
      <Command label="Search block types" className="block-inserter__command" filter={rank}>
        <CommandInput placeholder="Search blocks" />
        <CommandList label="Block types">
          <CommandEmpty>No block type found.</CommandEmpty>
          {GROUPS.map((group) => (
            <CommandGroup key={group.category} heading={group.heading}>
              {BLOCKS.filter(
                // A column is added with Columns, never on its own.
                (definition) =>
                  definition.category === group.category && definition.type !== "column",
              ).map((definition) => {
                const Icon = definition.icon;
                return (
                  <CommandItem
                    key={definition.type}
                    value={definition.type}
                    keywords={[definition.label, definition.description]}
                    onSelect={onAdd}
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span className="block-inserter__item">
                      <span>{definition.label}</span>
                      <span className="block-inserter__text">{definition.description}</span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
