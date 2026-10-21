import { type Menu, MenuSchema } from "@sitebuilder/schema";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { addItem, applyMenuMove, canMoveItems, removeItem, replaceItem } from "./menu-model";

const menu = (): Menu => [
  { id: "home-000001", label: "Home", kind: "url", url: "/" },
  {
    id: "group-00001",
    label: "Company",
    kind: "group",
    children: [
      { id: "about-00001", label: "About", kind: "url", url: "/about" },
      { id: "team-000001", label: "Team", kind: "url", url: "/team" },
    ],
  },
  { id: "blog-000001", label: "Blog", kind: "url", url: "/blog" },
];

const ids = (items: Menu) => items.map((item) => [item.id, (item.children ?? []).map((c) => c.id)]);

describe("menu moves", () => {
  it("moves a link into a group and out again, and the result is a valid menu", () => {
    const inside = applyMenuMove(menu(), {
      values: ["blog-000001"],
      target: "group-00001",
      position: "inside",
    });
    expect(ids(inside)).toEqual([
      ["home-000001", []],
      ["group-00001", ["about-00001", "team-000001", "blog-000001"]],
    ]);
    expect(v.is(MenuSchema, inside)).toBe(true);

    const out = applyMenuMove(inside, {
      values: ["about-00001"],
      target: "home-000001",
      position: "before",
    });
    expect(ids(out)[0]).toEqual(["about-00001", []]);
    expect(v.is(MenuSchema, out)).toBe(true);
  });

  it("keeps groups at the top and menus two levels deep", () => {
    const items = menu();
    expect(
      canMoveItems(items, { values: ["group-00001"], target: "home-000001", position: "inside" }),
    ).toBe(false);
    expect(
      canMoveItems(items, { values: ["blog-000001"], target: "about-00001", position: "inside" }),
    ).toBe(false);
    expect(
      canMoveItems(items, { values: ["blog-000001"], target: "about-00001", position: "after" }),
    ).toBe(true);
  });

  it("doesn't leave a group empty", () => {
    const one = applyMenuMove(menu(), {
      values: ["team-000001"],
      target: "blog-000001",
      position: "after",
    });
    expect(
      canMoveItems(one, { values: ["about-00001"], target: "blog-000001", position: "after" }),
    ).toBe(false);
    expect(ids(removeItem(one, "about-00001"))).toEqual([
      ["home-000001", []],
      ["blog-000001", []],
      ["team-000001", []],
    ]);
  });

  it("adds, replaces and removes items", () => {
    const added = addItem(
      menu(),
      { id: "careers-001", label: "Careers", kind: "url", url: "/jobs" },
      "group-00001",
    );
    expect(ids(added)[1]).toEqual(["group-00001", ["about-00001", "team-000001", "careers-001"]]);
    const renamed = replaceItem(added, {
      id: "careers-001",
      label: "Jobs",
      kind: "url",
      url: "/jobs",
    });
    expect(renamed[1]?.children?.[2]?.label).toBe("Jobs");
    expect(removeItem(renamed, "group-00001").map((item) => item.id)).toEqual([
      "home-000001",
      "blog-000001",
    ]);
  });
});
