// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createBlock } from "@sitebuilder/blocks";
import type { Block } from "@sitebuilder/schema";
import { describe, expect, test } from "vitest";
import {
  applyMove,
  canMove,
  duplicateBlock,
  findBlock,
  insertBlock,
  issueTarget,
  locate,
  moveBy,
  removeBlock,
  updateProps,
} from "./editor-model";

const block = (id: string, type: string, children?: Block[]): Block => ({
  id,
  type,
  props: {},
  ...(children ? { children } : {}),
});

// heading-a, a section holding text-b, and columns with two columns (the first holds image-c).
const page = (): Block[] => [
  block("heading-a", "heading"),
  block("section-1", "section", [block("text-b", "rich-text")]),
  block("columns-1", "columns", [
    block("column-1", "column", [block("image-c", "image")]),
    block("column-2", "column", []),
  ]),
];

describe("finding blocks", () => {
  test("locate gives the parent, the index and the depth", () => {
    expect(locate(page(), "image-c")).toMatchObject({
      parent: { id: "column-1" },
      index: 0,
      depth: 3,
    });
    expect(locate(page(), "heading-a")).toMatchObject({ parent: null, index: 0, depth: 1 });
    expect(locate(page(), "nope")).toBeUndefined();
  });
});

describe("changes", () => {
  test("update and remove work at any depth, without changing the original", () => {
    const original = page();
    const updated = updateProps(original, "image-c", { mediaId: "x" });
    expect(findBlock(updated, "image-c")?.props).toEqual({ mediaId: "x" });
    expect(findBlock(original, "image-c")?.props).toEqual({});
    expect(findBlock(removeBlock(original, "text-b"), "text-b")).toBeUndefined();
  });

  test("a new block goes inside a selected container that takes it, else after the selection", () => {
    const heading = createBlock("heading");
    const intoSection = insertBlock(page(), heading, "section-1");
    expect(findBlock(intoSection ?? [], "section-1")?.children?.map((b) => b.type)).toEqual([
      "rich-text",
      "heading",
    ]);
    const afterHeading = insertBlock(page(), createBlock("quote"), "heading-a");
    expect(afterHeading?.map((b) => b.type)).toEqual(["heading", "quote", "section", "columns"]);
    // Nothing selected: at the end.
    expect(insertBlock(page(), createBlock("spacer"), null)?.at(-1)?.type).toBe("spacer");
  });

  test("a section can't go inside a column: it lands at the top level instead", () => {
    // A column holds only leaf blocks, and columns hold only columns.
    const result = insertBlock(page(), createBlock("section"), "column-2");
    expect(result?.at(-1)?.type).toBe("section");
    expect(findBlock(result ?? [], "column-2")?.children).toEqual([]);
  });

  test("move up and down stays among neighbours", () => {
    expect(moveBy(page(), "section-1", -1).map((b) => b.id)).toEqual([
      "section-1",
      "heading-a",
      "columns-1",
    ]);
    expect(moveBy(page(), "heading-a", -1).map((b) => b.id)).toEqual([
      "heading-a",
      "section-1",
      "columns-1",
    ]);
  });

  test("duplicate gives fresh ids, and respects a container's most", () => {
    const copied = duplicateBlock(page(), "section-1");
    expect(copied?.blocks.map((b) => b.type)).toEqual(["heading", "section", "section", "columns"]);
    expect(copied?.copyId).not.toBe("section-1");
    const four = [
      block(
        "columns-1",
        "columns",
        [1, 2, 3, 4].map((n) => block(`column-${n}`, "column", [])),
      ),
    ];
    expect(duplicateBlock(four, "column-1")).toBeUndefined();
  });
});

describe("outline moves", () => {
  test("leaves move into sections and columns; containers don't nest past three levels", () => {
    expect(
      canMove(page(), { values: ["heading-a"], target: "section-1", position: "inside" }),
    ).toBe(true);
    expect(canMove(page(), { values: ["heading-a"], target: "column-2", position: "inside" })).toBe(
      true,
    );
    expect(canMove(page(), { values: ["section-1"], target: "column-2", position: "inside" })).toBe(
      false,
    );
    expect(
      canMove(page(), { values: ["heading-a"], target: "columns-1", position: "inside" }),
    ).toBe(false);
    expect(canMove(page(), { values: ["image-c"], target: "heading-a", position: "inside" })).toBe(
      false,
    );
  });

  test("columns keep at least two columns", () => {
    expect(canMove(page(), { values: ["column-2"], target: "heading-a", position: "after" })).toBe(
      false,
    );
  });

  test("applyMove takes the rows out and puts them at the place", () => {
    const moved = applyMove(page(), { values: ["image-c"], target: "text-b", position: "after" });
    expect(findBlock(moved, "section-1")?.children?.map((b) => b.id)).toEqual([
      "text-b",
      "image-c",
    ]);
    expect(findBlock(moved, "column-1")?.children).toEqual([]);
    const refused = applyMove(page(), {
      values: ["section-1"],
      target: "column-2",
      position: "inside",
    });
    expect(refused).toEqual(page());
  });
});

describe("issueTarget", () => {
  test("follows an issue's path to its block and field", () => {
    expect(issueTarget(page(), [2, "children", 0, "children", 0, "props", "mediaId"])).toEqual({
      blockId: "image-c",
      field: "mediaId",
    });
    expect(issueTarget(page(), [1, "children"])).toEqual({
      blockId: "section-1",
      field: undefined,
    });
    expect(issueTarget(page(), [9])).toBeUndefined();
  });
});
