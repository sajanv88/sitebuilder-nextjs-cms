// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ArrowDownIcon, ArrowUpIcon, CopyIcon, TargetIcon, TrashIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nuvui/react";
import { type AnyBlockDefinition, type Field, getBlockDefinition } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";
import { BlockFieldControl } from "@/components/block-fields/block-fields";
import type { BlockIssue } from "@/components/entry-editor/editor-state";
import "./block-inspector.scss";

// The selected block's fields, and what can be done to the block: move it, copy it, delete it.

// A field change, with the rest of the props kept. A table's rows follow its columns, so a row
// always has one cell for each column (the table's own check, packages/blocks).
function withField(
  definition: AnyBlockDefinition,
  props: Record<string, unknown>,
  field: Field,
  next: unknown,
): Record<string, unknown> {
  const copy = { ...props };
  if (next === undefined) delete copy[field.name];
  else copy[field.name] = next;
  for (const other of definition.fields) {
    if (other.kind !== "rows" || other.columnsFrom !== field.name) continue;
    const count = Array.isArray(copy[field.name]) ? (copy[field.name] as unknown[]).length : 0;
    const rows = Array.isArray(copy[other.name]) ? (copy[other.name] as unknown[]) : [];
    copy[other.name] = rows.map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return Array.from({ length: count }, (_, i) =>
        typeof cells[i] === "string" ? cells[i] : "",
      );
    });
  }
  return copy;
}

export function BlockInspector({
  block,
  issues,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: Block | undefined;
  issues: BlockIssue[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (props: Record<string, unknown>) => void;
  onMove: (step: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const definition = block ? getBlockDefinition(block.type) : undefined;
  if (!block || !definition) {
    return (
      <Empty>
        <EmptyMedia>
          <TargetIcon size={24} />
        </EmptyMedia>
        <EmptyTitle>No block selected</EmptyTitle>
        <EmptyDescription>
          Choose one on the page or in the outline to change it, or add one from Add.
        </EmptyDescription>
      </Empty>
    );
  }

  const mine = issues.filter((issue) => issue.blockId === block.id);
  const errors = Object.fromEntries(
    mine.filter((issue) => issue.field).map((issue) => [issue.field as string, issue.message]),
  );
  const general = mine.filter(
    (issue) => !issue.field || !definition.fields.some((f) => f.name === issue.field),
  );
  const Icon = definition.icon;

  return (
    <div className="block-inspector">
      <div className="block-inspector__head">
        <span className="block-inspector__icon">
          <Icon aria-hidden="true" size={18} />
        </span>
        <div className="block-inspector__name">
          <h2 className="block-inspector__title">{definition.label}</h2>
          <p className="block-inspector__text">{definition.description}</p>
        </div>
      </div>
      <div className="block-inspector__actions">
        <Button
          size="sm"
          intent="ghost"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          aria-label="Move up"
        >
          <ArrowUpIcon size={16} />
        </Button>
        <Button
          size="sm"
          intent="ghost"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          aria-label="Move down"
        >
          <ArrowDownIcon size={16} />
        </Button>
        <Button size="sm" intent="ghost" onClick={onDuplicate}>
          <CopyIcon size={16} />
          Duplicate
        </Button>
        <Button size="sm" intent="ghost" onClick={onRemove}>
          <TrashIcon size={16} />
          Delete
        </Button>
      </div>
      {general.length > 0 ? (
        <Alert intent="warning" role="alert">
          <AlertDescription>{general.map((issue) => issue.message).join(" ")}</AlertDescription>
        </Alert>
      ) : null}
      {definition.fields.length === 0 ? (
        <p className="block-inspector__text">This block has nothing to set.</p>
      ) : (
        <div className="block-inspector__fields">
          {definition.fields.map((field) => (
            <BlockFieldControl
              key={field.name}
              field={field}
              value={block.props[field.name]}
              errors={errors}
              siblings={block.props}
              onChange={(next) => onChange(withField(definition, block.props, field, next))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
