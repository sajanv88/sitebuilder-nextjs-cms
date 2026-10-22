// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ArrowDownIcon, ArrowUpIcon, CopyIcon, TrashIcon } from "@nuvui/icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@nuvui/react";
import { ADDABLE, BlockOption, GROUPS, rank } from "@/components/block-inserter/block-inserter";

// Ctrl+K in the editor: nuvui's command palette with every block type, the pinned ones first,
// and what can be done to the selected block. The Add tab and the inspector do the same; this
// is the quick way there. Running a command closes it.

export interface SelectedActions {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (step: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function QuickAdd({
  open,
  onOpenChange,
  pinned,
  onAdd,
  selected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pinned: string[];
  onAdd: (type: string) => void;
  selected: SelectedActions | null;
}) {
  const run = (action: () => void) => () => {
    action();
    onOpenChange(false);
  };
  const pinnedTypes = ADDABLE.filter((definition) => pinned.includes(definition.type));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shortcut="k"
      title="Quick add"
      label="Search blocks and actions"
      filter={rank}
    >
      <CommandInput placeholder="Add a block, or move the selected one" />
      <CommandList label="Blocks and actions">
        <CommandEmpty>Nothing found.</CommandEmpty>
        {selected ? (
          <CommandGroup heading={`Selected: ${selected.label}`}>
            <CommandItem
              value="action:up"
              keywords={["Move up"]}
              disabled={!selected.canMoveUp}
              aria-keyshortcuts="Alt+ArrowUp"
              onSelect={run(() => selected.onMove(-1))}
            >
              <ArrowUpIcon aria-hidden="true" size={16} />
              Move up
              <CommandShortcut>Alt+↑</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="action:down"
              keywords={["Move down"]}
              disabled={!selected.canMoveDown}
              aria-keyshortcuts="Alt+ArrowDown"
              onSelect={run(() => selected.onMove(1))}
            >
              <ArrowDownIcon aria-hidden="true" size={16} />
              Move down
              <CommandShortcut>Alt+↓</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="action:duplicate"
              keywords={["Duplicate"]}
              onSelect={run(selected.onDuplicate)}
            >
              <CopyIcon aria-hidden="true" size={16} />
              Duplicate
            </CommandItem>
            <CommandItem
              value="action:remove"
              keywords={["Delete", "remove"]}
              aria-keyshortcuts="Delete"
              onSelect={run(selected.onRemove)}
            >
              <TrashIcon aria-hidden="true" size={16} />
              Delete
              <CommandShortcut>Delete</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {pinnedTypes.length > 0 ? (
          <CommandGroup heading="Pinned">
            {pinnedTypes.map((definition) => (
              <CommandItem
                key={definition.type}
                value={`pinned:${definition.type}`}
                keywords={[definition.label, definition.description]}
                onSelect={run(() => onAdd(definition.type))}
              >
                <BlockOption definition={definition} />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {GROUPS.map((group) => (
          <CommandGroup key={group.category} heading={`Add: ${group.heading}`}>
            {ADDABLE.filter(
              (definition) =>
                definition.category === group.category && !pinned.includes(definition.type),
            ).map((definition) => (
              <CommandItem
                key={definition.type}
                value={definition.type}
                keywords={[definition.label, definition.description]}
                onSelect={run(() => onAdd(definition.type))}
              >
                <BlockOption definition={definition} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
