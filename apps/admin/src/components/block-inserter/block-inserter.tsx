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
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  PinnedList,
  PinnedListItem,
  Separator,
} from "@nuvui/react";
import { type AnyBlockDefinition, BLOCKS, type BlockCategory } from "@sitebuilder/blocks";
import { Fragment, useEffect, useRef, useState } from "react";
import "./block-inserter.scss";

// The block types to add (design §8: a searchable inserter). A new block goes inside the
// selected block when that's a container that takes it, otherwise after it. With the search
// empty, every type is listed with a pin: the pinned ones at the top, then the rest by
// category, a line between each (a nuvui PinnedList for each, since one has only two groups).
// Typing searches them, the pinned first.

export const GROUPS: { category: BlockCategory; heading: string }[] = [
  { category: "text", heading: "Text" },
  { category: "media", heading: "Media" },
  { category: "layout", heading: "Layout" },
  { category: "marketing", heading: "Marketing" },
  { category: "data", heading: "Lists and tables" },
];

// What can be added: everything but a column, which comes with Columns. In the groups' order.
export const ADDABLE: readonly AnyBlockDefinition[] = GROUPS.flatMap((group) =>
  BLOCKS.filter(
    (definition) => definition.category === group.category && definition.type !== "column",
  ),
);
const BY_TYPE = new Map(ADDABLE.map((definition) => [definition.type, definition]));

// Names before descriptions, and words, not scattered letters: Command's own loose match puts
// Callout above Columns for "columns", from letters spread through Callout's description.
export function rank(value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const name = (keywords?.[0] ?? value).toLowerCase();
  if (name.startsWith(query)) return 1;
  if (name.includes(query) || value.includes(query)) return 0.8;
  return (keywords?.[1] ?? "").toLowerCase().includes(query) ? 0.3 : 0;
}

export function BlockOption({ definition }: { definition: AnyBlockDefinition }) {
  const Icon = definition.icon;
  return (
    <>
      <Icon aria-hidden="true" size={16} />
      <span className="block-inserter__item">
        <span>{definition.label}</span>
        <span className="block-inserter__text">{definition.description}</span>
      </span>
    </>
  );
}

export function BlockInserter({
  onAdd,
  pinned,
  onPinnedChange,
}: {
  onAdd: (type: string) => void;
  pinned: string[];
  onPinnedChange: (pinned: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const pinnedTypes = ADDABLE.filter((definition) => pinned.includes(definition.type));
  const lists = useRef<HTMLDivElement>(null);
  const moved = useRef<string | null>(null);

  // A pin moves its block to another list, so its pin there takes the focus, as it would
  // within one list. After every render, doing nothing unless a pin was just pressed.
  useEffect(() => {
    const type = moved.current;
    if (!type) return;
    moved.current = null;
    lists.current
      ?.querySelector<HTMLButtonElement>(`[data-block-type="${type}"] button[aria-pressed]`)
      ?.focus();
  });

  const pin = (next: string[], change: { value: string }) => {
    moved.current = change.value;
    onPinnedChange(next);
  };

  const row = (type: string) => {
    const definition = BY_TYPE.get(type);
    if (!definition) return null;
    const Icon = definition.icon;
    return (
      <PinnedListItem value={type} label={definition.label} data-block-type={type}>
        {/* The whole row is the button that adds it; the pin is beside it. */}
        <Item asChild size="sm">
          <button type="button" onClick={() => onAdd(type)}>
            <ItemMedia>
              <Icon aria-hidden="true" size={16} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{definition.label}</ItemTitle>
              <ItemDescription className="block-inserter__text">
                {definition.description}
              </ItemDescription>
            </ItemContent>
          </button>
        </Item>
      </PinnedListItem>
    );
  };

  return (
    <div className="block-inserter">
      <p className="block-inserter__hint">
        Added after the selected block, or inside it when it holds blocks. Pin the ones you use
        most.
      </p>
      <Command label="Search block types" className="block-inserter__command" filter={rank}>
        <CommandInput placeholder="Search blocks" value={search} onValueChange={setSearch} />
        {search.trim() ? (
          <CommandList label="Block types">
            <CommandEmpty>No block type found.</CommandEmpty>
            {pinnedTypes.length > 0 ? (
              <CommandGroup heading="Pinned">
                {pinnedTypes.map((definition) => (
                  <CommandItem
                    key={definition.type}
                    value={`pinned:${definition.type}`}
                    keywords={[definition.label, definition.description]}
                    onSelect={() => onAdd(definition.type)}
                  >
                    <BlockOption definition={definition} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {GROUPS.map((group) => (
              <CommandGroup key={group.category} heading={group.heading}>
                {ADDABLE.filter(
                  (definition) =>
                    definition.category === group.category && !pinned.includes(definition.type),
                ).map((definition) => (
                  <CommandItem
                    key={definition.type}
                    value={definition.type}
                    keywords={[definition.label, definition.description]}
                    onSelect={onAdd}
                  >
                    <BlockOption definition={definition} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        ) : null}
      </Command>
      {search.trim() ? null : (
        <div ref={lists} className="block-inserter__lists">
          <PinnedList
            items={pinnedTypes.map((definition) => definition.type)}
            pinned={pinned}
            onPinnedChange={pin}
            className="block-inserter__pins"
          >
            {row}
          </PinnedList>
          {GROUPS.map((group, index) => {
            const types = ADDABLE.filter(
              (definition) =>
                definition.category === group.category && !pinned.includes(definition.type),
            ).map((definition) => definition.type);
            // Each list stays drawn while empty: it says what was pinned from it.
            const line = types.length > 0 && (index > 0 || pinnedTypes.length > 0);
            return (
              <Fragment key={group.category}>
                {line ? <Separator /> : null}
                <PinnedList
                  items={types}
                  pinned={pinned}
                  onPinnedChange={pin}
                  restLabel={group.heading}
                  className="block-inserter__pins"
                >
                  {row}
                </PinnedList>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
