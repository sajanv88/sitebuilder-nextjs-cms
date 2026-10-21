// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, test } from "vitest";
import type { Block, BlockRules } from "./blocks";
import { validateBlockList } from "./validate-block-list";

// A small registry shaped like the first block set: two leaves and the three containers.
const leaves = ["heading", "separator"];
const rules: BlockRules = {
  heading: {
    props: v.strictObject({
      text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
      level: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6)), 2),
    }),
  },
  separator: { props: v.strictObject({}) },
  "rich-text": { props: v.strictObject({ html: v.pipe(v.string(), v.maxLength(100_000)) }) },
  section: { props: v.strictObject({}), container: { allow: leaves, min: 0, max: 50 } },
  columns: { props: v.strictObject({}), container: { allow: ["column"], min: 2, max: 4 } },
  column: { props: v.strictObject({}), container: { allow: leaves, min: 0, max: 30 } },
};

// Stands in for the real cleaner in packages/blocks: drops script elements.
const options = { sanitizeHtml: (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "") };

let next = 0;
const id = () => `block-${String(++next).padStart(4, "0")}`;
const heading = (text: string): Block => ({ id: id(), type: "heading", props: { text } });
const column = (children: Block[]): Block => ({ id: id(), type: "column", props: {}, children });

const codes = (input: unknown) => {
  const result = validateBlockList(input, rules, options);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

describe("validateBlockList", () => {
  test("accepts a valid list and returns parsed props", () => {
    const result = validateBlockList(
      [
        { id: id(), type: "heading", props: { text: "  Hello  " } },
        { id: id(), type: "columns", props: {}, children: [column([heading("A")]), column([])] },
      ],
      rules,
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.props).toEqual({ text: "Hello", level: 2 });
    expect(result.value[1]?.children).toHaveLength(2);
  });

  test("1. rejects a wrong shape, with the path", () => {
    const result = validateBlockList([{ id: "short", type: "heading", props: {} }], rules, options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ code: "invalid-shape", path: [0, "id"] });
    expect(codes("not a list")).toEqual(["invalid-shape"]);
  });

  test("2. rejects more than 500 blocks", () => {
    const list = Array.from({ length: 301 }, () => ({
      id: id(),
      type: "section",
      props: {},
      children: [heading("x")],
    }));
    expect(codes(list)).toContain("too-many-blocks");
  });

  test("2. rejects nesting deeper than 3 levels", () => {
    const deep = {
      id: id(),
      type: "section",
      props: {},
      children: [column([column([heading("x")])])],
    };
    expect(codes([deep])).toContain("too-deep");
  });

  test("2. rejects duplicate ids anywhere in the tree", () => {
    const a = heading("a");
    expect(codes([a, { id: id(), type: "section", props: {}, children: [{ ...a }] }])).toEqual([
      "duplicate-id",
    ]);
  });

  test("3. rejects unknown block types", () => {
    expect(codes([{ id: id(), type: "marquee", props: {} }])).toEqual(["unknown-type"]);
  });

  test("4. rejects invalid and unknown props", () => {
    const result = validateBlockList(
      [{ id: id(), type: "heading", props: { text: "Hi", level: 9, colour: "red" } }],
      rules,
      options,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.every((issue) => issue.code === "invalid-props")).toBe(true);
    expect(result.issues.map((issue) => issue.path)).toContainEqual([0, "props", "level"]);
  });

  test("5. children only on containers, of allowed types, within the count", () => {
    expect(codes([{ ...heading("x"), children: [] }])).toEqual(["children-not-allowed"]);
    expect(
      codes([{ id: id(), type: "columns", props: {}, children: [heading("x"), column([])] }]),
    ).toEqual(["child-type-not-allowed"]);
    expect(codes([{ id: id(), type: "columns", props: {}, children: [column([])] }])).toEqual([
      "too-few-children",
    ]);
    const five = Array.from({ length: 5 }, () => column([]));
    expect(codes([{ id: id(), type: "columns", props: {}, children: five }])).toEqual([
      "too-many-children",
    ]);
  });

  test("6. html props are stored cleaned, also inside containers", () => {
    const dirty = "<p>Hi</p><script>alert(1)</script>";
    const result = validateBlockList(
      [
        { id: id(), type: "rich-text", props: { html: dirty } },
        {
          id: id(),
          type: "section",
          props: {},
          children: [{ id: id(), type: "rich-text", props: { html: dirty } }],
        },
      ],
      { ...rules, section: { props: v.strictObject({}), container: { allow: ["rich-text"] } } },
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.props).toEqual({ html: "<p>Hi</p>" });
    expect(result.value[1]?.children?.[0]?.props).toEqual({ html: "<p>Hi</p>" });
  });
});
