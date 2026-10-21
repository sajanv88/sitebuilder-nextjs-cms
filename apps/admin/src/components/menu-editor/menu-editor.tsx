// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  ListIcon,
  PlusIcon,
  TagIcon,
} from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Tree,
  TreeItem,
  toast,
} from "@nuvui/react";
import { type Menu, type MenuLocation, MenuSchema } from "@sitebuilder/schema";
import { useState, useTransition } from "react";
import * as v from "valibot";
import { type MenuTarget, saveMenuItems } from "@/actions/menus";
import { MenuItemForm, type MenuTerm } from "@/components/menu-item-form/menu-item-form";
import {
  type AnyItem,
  addItem,
  applyMenuMove,
  canAddUnder,
  canMoveItems,
  findItem,
  removeItem,
  replaceItem,
} from "./menu-model";
import "./menu-editor.scss";

// One menu, after nuvui's file-browser block (design §5.3): its items as a Tree on one side,
// two levels, moved by dragging or with Alt and an arrow key, and the chosen item's details
// beside it, changed in place. One Save for the whole menu.

type Problem = "missing" | "unpublished";

const PROBLEM_TEXT: Record<Problem, string> = {
  missing: "Its page or term is gone",
  unpublished: "Not published: hidden on the site",
};

const KIND_TEXT: Record<AnyItem["kind"], string> = {
  entry: "Page or post",
  term: "Category or tag",
  url: "Web address",
  group: "Group",
};

const KIND_ICON = {
  entry: FileTextIcon,
  term: TagIcon,
  url: ExternalLinkIcon,
  group: FolderIcon,
} as const;

type Panel = { mode: "none" } | { mode: "add"; parentId: string | null } | { mode: "edit" };

export function MenuEditor({
  location,
  name,
  initial,
  entries: initialEntries,
  terms,
}: {
  location: MenuLocation;
  // "Primary menu", for labels.
  name: string;
  initial: Menu;
  entries: Record<string, MenuTarget>;
  terms: MenuTerm[];
}) {
  const [items, setItems] = useState(initial);
  const [entries, setEntries] = useState(initialEntries);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>({ mode: "none" });
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function change(next: Menu) {
    setItems(next);
    setDirty(true);
    setProblem(null);
  }

  function select(id: string | null) {
    setSelected(id);
    setPanel(id ? { mode: "edit" } : { mode: "none" });
  }

  function problemOf(item: AnyItem): Problem | null {
    if (item.kind === "entry") {
      const entry = entries[item.entryId];
      return !entry ? "missing" : entry.public ? null : "unpublished";
    }
    if (item.kind === "term") return terms.some((t) => t.id === item.termId) ? null : "missing";
    return null;
  }

  function targetText(item: AnyItem): string {
    switch (item.kind) {
      case "entry":
        return entries[item.entryId]?.path ?? "A page that's gone";
      case "term": {
        const term = terms.find((t) => t.id === item.termId);
        return term
          ? `${term.taxonomy === "category" ? "Category" : "Tag"}: ${term.name}`
          : "A term that's gone";
      }
      case "url":
        return item.url;
      case "group":
        return "Opens a list of the items under it";
    }
  }

  const found = selected ? findItem(items, selected) : undefined;

  function save() {
    const checked = v.safeParse(MenuSchema, items);
    if (!checked.success) {
      setProblem(
        items.some((item) => item.kind === "group" && (item.children?.length ?? 0) === 0)
          ? "A group needs at least one item under it."
          : "An item isn't complete. Open each marked one and check it.",
      );
      return;
    }
    startSave(async () => {
      const result = await saveMenuItems(location, items);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      setDirty(false);
      toast(`${name} saved.`, { intent: "success" });
    });
  }

  const rows = (list: readonly AnyItem[]) =>
    list.map((item) => {
      const issue = problemOf(item);
      const Icon = KIND_ICON[item.kind];
      const children = "children" in item ? (item.children ?? []) : [];
      return (
        <TreeItem
          key={item.id}
          value={item.id}
          textValue={item.label}
          label={
            <span className="menu-editor__row">
              <Icon aria-hidden="true" size={16} className="menu-editor__icon" />
              <span className="menu-editor__label">{item.label}</span>
              {issue ? (
                <AlertTriangleIcon
                  aria-label={PROBLEM_TEXT[issue]}
                  size={14}
                  className="menu-editor__warning"
                />
              ) : null}
            </span>
          }
        >
          {children.length > 0 ? rows(children) : null}
        </TreeItem>
      );
    });

  const topIds = items.filter((item) => (item.children?.length ?? 0) > 0).map((item) => item.id);

  // The chosen item's place in the menu, as the file browser shows a file's folder.
  const where = found?.parent ? `${name} / ${found.parent.label}` : name;

  return (
    <div className="menu-editor">
      <div className="menu-editor__toolbar">
        <Button
          intent="secondary"
          disabled={!canAddUnder(items, null)}
          onClick={() => {
            setSelected(null);
            setPanel({ mode: "add", parentId: null });
          }}
        >
          <PlusIcon aria-hidden="true" size={16} />
          Add item
        </Button>
        <span className="menu-editor__state" role="status">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : ""}
        </span>
        <Button onClick={save} disabled={saving || !dirty} aria-busy={saving}>
          Save {name.toLowerCase()}
        </Button>
      </div>

      {problem ? (
        <Alert intent="warning" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}

      <div className="menu-editor__panes">
        <div className="menu-editor__tree-pane">
          {items.length === 0 ? (
            <Empty className="menu-editor__empty">
              <EmptyMedia>
                <ListIcon aria-hidden="true" size={24} />
              </EmptyMedia>
              <EmptyTitle>No items yet</EmptyTitle>
              <EmptyDescription>
                Add pages, posts, categories or web addresses. Until then the site shows no{" "}
                {name.toLowerCase()}.
              </EmptyDescription>
            </Empty>
          ) : (
            <Tree
              aria-label={`${name} items`}
              className="menu-editor__tree"
              selectionMode="single"
              value={selected ? [selected] : []}
              onValueChange={(value) => select(value[0] ?? null)}
              expanded={topIds}
              onMove={(move) => change(applyMenuMove(items, move))}
              canDrop={(move) => canMoveItems(items, move)}
            >
              {rows(items)}
            </Tree>
          )}
          <p className="menu-editor__hint">
            Drag a row to move it, or select it and press Alt with an arrow key.
          </p>
        </div>

        <section className="menu-editor__detail" aria-labelledby={`menu-detail-${location}`}>
          {panel.mode === "add" ? (
            <>
              <div className="menu-editor__head">
                <h2 id={`menu-detail-${location}`} className="menu-editor__heading">
                  {panel.parentId
                    ? `Add under ${findItem(items, panel.parentId)?.item.label ?? "it"}`
                    : "Add a menu item"}
                </h2>
              </div>
              <p className="menu-editor__path">
                {panel.parentId
                  ? `${name} / ${findItem(items, panel.parentId)?.item.label ?? ""}`
                  : `At the end of the ${name.toLowerCase()}`}
              </p>
              <MenuItemForm
                key={`add-${panel.parentId ?? "top"}`}
                item={undefined}
                topLevel={panel.parentId === null}
                entries={entries}
                terms={terms}
                onCancel={() => setPanel({ mode: "none" })}
                onDone={(item, picked) => {
                  if (picked) setEntries((now) => ({ ...now, [picked.id]: picked }));
                  change(addItem(items, item, panel.parentId));
                  select(item.id);
                }}
              />
            </>
          ) : panel.mode === "edit" && found ? (
            <>
              <div className="menu-editor__head">
                <h2 id={`menu-detail-${location}`} className="menu-editor__heading">
                  {found.item.label}
                </h2>
                <Badge variant="outline">{KIND_TEXT[found.item.kind]}</Badge>
              </div>
              <p className="menu-editor__path">
                {where} · {targetText(found.item)}
              </p>
              {problemOf(found.item) ? (
                <Alert intent="warning">
                  <AlertDescription>
                    {problemOf(found.item) === "unpublished"
                      ? "It links to something that isn't published, so the site leaves it out until it is."
                      : "What it links to is gone, so the site leaves it out. Choose something else, or remove it."}
                  </AlertDescription>
                </Alert>
              ) : null}
              <MenuItemForm
                key={found.item.id}
                item={found.item}
                topLevel={found.parent === null}
                entries={entries}
                terms={terms}
                onCancel={() => select(found.item.id)}
                onDone={(item, picked) => {
                  if (picked) setEntries((now) => ({ ...now, [picked.id]: picked }));
                  change(replaceItem(items, item));
                }}
                extra={
                  <>
                    {found.parent === null ? (
                      <Button
                        intent="secondary"
                        disabled={!canAddUnder(items, found.item.id)}
                        onClick={() => setPanel({ mode: "add", parentId: found.item.id })}
                      >
                        <PlusIcon aria-hidden="true" size={16} />
                        Add under it
                      </Button>
                    ) : null}
                    <Button
                      intent="ghost"
                      className="menu-editor__remove"
                      onClick={() => {
                        change(removeItem(items, found.item.id));
                        select(null);
                      }}
                    >
                      Remove
                    </Button>
                  </>
                }
              />
            </>
          ) : (
            <div className="menu-editor__head">
              <h2 id={`menu-detail-${location}`} className="menu-editor__heading">
                Choose an item
              </h2>
              <p className="menu-editor__path">
                Its details show here, to change in place. Add an item to start a menu.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
