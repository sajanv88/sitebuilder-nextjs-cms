// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { MenuSchema } from "./menu";
import { defaultSettings, SettingsSchemas, TemplateSettings, TemplateSlug } from "./settings";
import {
  resolveRefs,
  type StarterContent,
  StarterContentSchema,
  satisfiesRange,
  starterIssues,
  starterMenu,
  TemplateManifestSchema,
  withBlockIds,
} from "./templates";

const manifest = {
  slug: "studio",
  name: "Studio",
  version: "1.0.0",
  description: "A portfolio for a small studio.",
  licence: "GPL-2.0-or-later",
  requires: { sitebuilder: "^0.1.0", nuvui: "^0.8.0" },
  screenshots: [{ file: "screenshots/home.png", label: "Home page" }],
  starter: "content/starter.json",
};

function counter(prefix = "block") {
  let n = 0;
  return () => `${prefix}${String(++n).padStart(4, "0")}`;
}

describe("TemplateManifestSchema", () => {
  test("accepts a data-only manifest", () => {
    expect(v.is(TemplateManifestSchema, manifest)).toBe(true);
  });

  test("rejects keys it doesn't know", () => {
    expect(v.is(TemplateManifestSchema, { ...manifest, scripts: {} })).toBe(false);
  });

  test.each([
    ["a path out of the folder", { starter: "../starter.json" }],
    ["an absolute path", { starter: "/etc/starter.json" }],
    ["a dotfile", { starter: "content/.starter.json" }],
    ["a screenshot that isn't an image", { screenshots: [{ file: "a.svg", label: "A" }] }],
    ["a licence that isn't allowed", { licence: "Proprietary" }],
    ["a range form it doesn't read", { requires: { sitebuilder: "~0.1.0", nuvui: "^0.8.0" } }],
    ["a reserved slug", { slug: "generated" }],
  ])("rejects %s", (_, change) => {
    expect(v.is(TemplateManifestSchema, { ...manifest, ...change })).toBe(false);
  });
});

describe("satisfiesRange", () => {
  test.each([
    ["0.1.0", "^0.1.0", true],
    ["0.1.5", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["0.0.9", "^0.1.0", false],
    ["1.4.0", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["3.0.0", ">=1.2.0", true],
    ["1.1.9", ">=1.2.0", false],
  ])("%s in %s is %s", (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });
});

const starter = (): StarterContent =>
  v.parse(StarterContentSchema, {
    pages: [
      {
        ref: "home",
        title: "Home",
        slug: "home",
        content: [
          {
            type: "button",
            props: { label: "About us", href: { kind: "entry", entryId: "ref:about" } },
          },
        ],
      },
      { ref: "about", title: "About", slug: "about", content: [] },
      { ref: "team", parentRef: "about", title: "Team", slug: "team", content: [] },
    ],
    posts: [{ ref: "hello", title: "Hello", slug: "hello", content: [] }],
    menus: {
      primary: [{ label: "About", ref: "about", children: [{ label: "Team", ref: "team" }] }],
      footer: [{ label: "Source", url: "https://example.com" }],
    },
    homeRef: "home",
  });

describe("StarterContentSchema and starterIssues", () => {
  test("a consistent starter has no issues", () => {
    expect(starterIssues(starter())).toEqual([]);
  });

  test("a page's parent defaults to none", () => {
    expect(starter().pages[0]?.parentRef).toBeNull();
  });

  test("names a ref used twice", () => {
    const content = starter();
    content.posts.push({ ref: "about", title: "Again", slug: "again", content: [] });
    expect(starterIssues(content).map((issue) => issue.code)).toEqual(["duplicate-ref"]);
  });

  test("names a parent that comes later, or isn't a page", () => {
    const content = starter();
    const [home, about, team] = content.pages;
    if (!home || !about || !team) throw new Error("fixture");
    content.pages = [home, team, about];
    expect(starterIssues(content)).toMatchObject([
      { path: ["pages", 1, "parentRef"], code: "unknown-parent" },
    ]);
  });

  test("names a home page, menu item or link that isn't a starter entry", () => {
    const content = starter();
    content.homeRef = "hello";
    content.menus?.primary.push({ label: "Gone", ref: "gone" });
    const button = content.pages[0]?.content[0];
    if (!button) throw new Error("fixture");
    button.props = { label: "x", href: { kind: "entry", entryId: "ref:nowhere" } };
    expect(starterIssues(content).map((issue) => issue.path)).toEqual([
      ["homeRef"],
      ["menus", "primary", 1],
      ["pages", 0, "content", 0, "props", "href", "entryId"],
    ]);
  });
});

describe("resolveRefs", () => {
  const ids = new Map([["about", "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70"]]);

  test("replaces refs at any depth and leaves everything else", () => {
    const input = {
      a: [{ kind: "entry", entryId: "ref:about" }],
      b: { kind: "url", url: "/x" },
      c: { kind: "entry", entryId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f71" },
    };
    const { value, issues } = resolveRefs(input, ids);
    expect(issues).toEqual([]);
    expect(value).toEqual({
      a: [{ kind: "entry", entryId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70" }],
      b: { kind: "url", url: "/x" },
      c: { kind: "entry", entryId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f71" },
    });
    expect(input.a[0]?.entryId).toBe("ref:about");
  });

  test("reports an unknown ref with its path and leaves it in place", () => {
    const { value, issues } = resolveRefs([{ kind: "entry", entryId: "ref:gone" }], ids, ["x"]);
    expect(issues).toMatchObject([{ path: ["x", 0, "entryId"], code: "unknown-ref" }]);
    expect(value).toEqual([{ kind: "entry", entryId: "ref:gone" }]);
  });
});

describe("withBlockIds and starterMenu", () => {
  test("gives every block an id and keeps the ones written", () => {
    const blocks = withBlockIds(
      [{ type: "section", props: {}, children: [{ id: "kept-id-1", type: "heading", props: {} }] }],
      counter(),
    );
    expect(blocks).toEqual([
      {
        id: "block0001",
        type: "section",
        props: {},
        children: [{ id: "kept-id-1", type: "heading", props: {} }],
      },
    ]);
  });

  test("turns refs into entry links that MenuSchema accepts", () => {
    const content = starter();
    const ids = new Map([
      ["about", "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70"],
      ["team", "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f71"],
    ]);
    const menu = starterMenu(content.menus?.primary ?? [], ids, counter("item"));
    expect(menu).toEqual([
      {
        id: "item0001",
        label: "About",
        kind: "entry",
        entryId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70",
        children: [
          {
            id: "item0002",
            label: "Team",
            kind: "entry",
            entryId: "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f71",
          },
        ],
      },
    ]);
    expect(v.is(MenuSchema, menu)).toBe(true);
  });
});

describe("TemplateSettings", () => {
  test("is in the settings /setup writes, as the default template", () => {
    expect(defaultSettings("https://example.com").template).toEqual({
      slug: "default",
      options: {},
    });
    expect(SettingsSchemas.template).toBe(TemplateSettings);
  });

  test("defaults the options for a row written without them", () => {
    expect(v.parse(TemplateSettings, { slug: "studio" })).toEqual({ slug: "studio", options: {} });
  });

  test("rejects a slug that isn't one", () => {
    expect(v.is(TemplateSlug, "Studio")).toBe(false);
    expect(v.is(TemplateSlug, "node_modules")).toBe(false);
  });
});
