"use client";

import { AlertTriangleIcon } from "@nuvui/icons";
import { Tree, TreeItem, type TreeMove, VisuallyHidden } from "@nuvui/react";
import { getBlockDefinition } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";
import { useState } from "react";
import { canMove } from "@/components/block-editor/editor-model";
import "./block-outline.scss";

// The page's blocks as nuvui's Tree (design §8: an outline). Rows move by dragging, or with Alt
// and an arrow key, into and out of containers, as far as the container rules allow
// (decisions #50). Selecting a row selects the block.

function containerIds(blocks: readonly Block[]): string[] {
  return blocks.flatMap((block) =>
    block.children ? [block.id, ...containerIds(block.children)] : [],
  );
}

export function BlockOutline({
  blocks,
  selectedId,
  issueIds,
  onSelect,
  onMove,
}: {
  blocks: readonly Block[];
  selectedId: string | null;
  issueIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onMove: (move: TreeMove) => void;
}) {
  // Containers start open; the outline remembers only the ones closed.
  const [closed, setClosed] = useState<string[]>([]);
  const containers = containerIds(blocks);
  const expanded = containers.filter((id) => !closed.includes(id));

  const rows = (list: readonly Block[]) =>
    list.map((block) => {
      const definition = getBlockDefinition(block.type);
      const label = definition?.label ?? block.type;
      const summary = definition ? safeSummary(definition, block.props) : "";
      const Icon = definition?.icon;
      const problem = issueIds.has(block.id);
      return (
        <TreeItem
          key={block.id}
          value={block.id}
          textValue={label}
          label={
            <span className="block-outline__label">
              {Icon ? <Icon aria-hidden="true" size={16} className="block-outline__icon" /> : null}
              <span className="block-outline__type">{label}</span>
              {summary && summary !== label ? (
                <span className="block-outline__summary">{summary}</span>
              ) : null}
              {problem ? (
                <span className="block-outline__problem">
                  <AlertTriangleIcon aria-hidden="true" size={14} />
                  <VisuallyHidden>, needs attention</VisuallyHidden>
                </span>
              ) : null}
            </span>
          }
        >
          {block.children && block.children.length > 0 ? rows(block.children) : null}
        </TreeItem>
      );
    });

  if (blocks.length === 0) {
    return <p className="block-outline__empty">No blocks yet. Add one from Add.</p>;
  }

  return (
    <div className="block-outline">
      <p className="block-outline__hint">
        Drag a row to move it, or select it and press Alt with an arrow key.
      </p>
      <Tree
        aria-label="Blocks on this page"
        className="block-outline__tree"
        selectionMode="single"
        value={selectedId ? [selectedId] : []}
        onValueChange={(value) => onSelect(value[0] ?? null)}
        expanded={expanded}
        onExpandedChange={(next) => setClosed(containers.filter((id) => !next.includes(id)))}
        onMove={onMove}
        canDrop={(move) => canMove(blocks, move)}
      >
        {rows(blocks)}
      </Tree>
    </div>
  );
}

// A block being filled in may not have every prop its summary reads.
function safeSummary(
  definition: NonNullable<ReturnType<typeof getBlockDefinition>>,
  props: Record<string, unknown>,
): string {
  try {
    return definition.summary({ ...definition.defaults(), ...props });
  } catch {
    return "";
  }
}
