// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ImportedEntry } from "@sitebuilder/db";
import { type BlockListResult, StarterContentSchema } from "@sitebuilder/schema";
import type { GeneratedTemplate } from "@sitebuilder/templates/admin";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { type ActivationChoices, buildActivation, planStarter } from "./template-plan";

const starter = v.parse(StarterContentSchema, {
  pages: [
    {
      ref: "home",
      title: "Home",
      slug: "home",
      content: [
        {
          type: "button",
          props: { label: "About", href: { kind: "entry", entryId: "ref:about" } },
        },
      ],
    },
    { ref: "about", title: "About", slug: "about", content: [] },
    { ref: "team", parentRef: "about", title: "Team", slug: "team", content: [] },
    { ref: "blog", title: "Blog", slug: "blog", content: [] },
  ],
  posts: [{ ref: "hello", title: "Hello", slug: "page", content: [] }],
  menus: {
    primary: [
      { label: "About", ref: "about" },
      { label: "Source", url: "https://example.com" },
    ],
    footer: [],
  },
  homeRef: "home",
});

const template: GeneratedTemplate = {
  source: "bundled",
  manifest: {
    slug: "studio",
    name: "Studio",
    version: "1.0.0",
    description: "A studio.",
    licence: "GPL-2.0-or-later",
    requires: { sitebuilder: "^0.1.0", nuvui: "^0.8.0" },
    theme: { preset: "ember", mode: "light", density: "default", tokens: {} },
    screenshots: [],
  },
  starter,
  screenshots: [],
};

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const accept = (content: unknown): BlockListResult => ({ ok: true, value: content as never });

const all: ActivationChoices = {
  theme: true,
  starter: true,
  menus: true,
  home: true,
  publish: false,
};

const imported = (ref: string, id: string, path: string, trashed = false): ImportedEntry => ({
  id,
  sourceRef: `template:studio:${ref}`,
  title: `${ref} as edited`,
  path,
  trashed,
});

describe("planStarter", () => {
  test("plans every entry new, with nested paths and numbers past reserved slugs", () => {
    const plan = planStarter("studio", starter, [], "/blog", counter("id"));
    expect(plan.entries.map((e) => [e.ref, e.path, e.state])).toEqual([
      ["home", "/home", "new"],
      ["about", "/about", "new"],
      ["team", "/about/team", "new"],
      // "blog" is the posts path's own segment; "page" is reserved under it.
      ["blog", "/blog-2", "new"],
      ["hello", "/blog/page-2", "new"],
    ]);
    expect(plan.ids.get("team")).toBe("id-3");
  });

  test("keeps what an earlier activation made, at its current path", () => {
    const plan = planStarter(
      "studio",
      starter,
      [imported("about", "old-about", "/company"), imported("home", "old-home", "/home", true)],
      "/blog",
      counter("id"),
    );
    expect(plan.entries.slice(0, 3).map((e) => [e.ref, e.path, e.state, e.title])).toEqual([
      ["home", "/home", "trashed", "home as edited"],
      ["about", "/company", "added", "about as edited"],
      ["team", "/company/team", "new", "Team"],
    ]);
    expect(plan.ids.get("about")).toBe("old-about");
  });
});

describe("buildActivation", () => {
  const build = (choices: ActivationChoices, done: ImportedEntry[] = []) =>
    buildActivation({
      template,
      plan: planStarter("studio", starter, done, "/blog", counter("id")),
      choices,
      actorId: "admin",
      validate: accept,
      makeBlockId: counter("block"),
    });

  test("everything ticked: theme, every new entry with links resolved, menus and home page", () => {
    const result = build(all);
    if (!result.ok) throw new Error(result.error);
    const { activation } = result;
    expect(activation.theme?.preset).toBe("ember");
    expect(activation.entries.map((e) => [e.sourceRef, e.parentId, e.slug])).toEqual([
      ["template:studio:home", null, "home"],
      ["template:studio:about", null, "about"],
      ["template:studio:team", "id-2", "team"],
      ["template:studio:blog", null, "blog-2"],
      ["template:studio:hello", null, "page-2"],
    ]);
    expect(activation.entries[0]?.content[0]?.props.href).toEqual({
      kind: "entry",
      entryId: "id-2",
    });
    expect(activation.menus?.primary.map((item) => item.label)).toEqual(["About", "Source"]);
    expect(activation.homepageEntryId).toBe("id-1");
    expect(activation.publish).toBe(false);
  });

  test("the theme alone writes no entries, menus of nothing but links, and no home page", () => {
    const result = build({ ...all, starter: false });
    if (!result.ok) throw new Error(result.error);
    expect(result.activation.entries).toEqual([]);
    expect(result.activation.menus?.primary.map((item) => item.label)).toEqual(["Source"]);
    expect(result.activation.homepageEntryId).toBeUndefined();
  });

  test("again after an earlier activation: only what's missing, and nothing trashed brought back", () => {
    const result = build(all, [
      imported("home", "old-home", "/home", true),
      imported("about", "old-about", "/about"),
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.activation.entries.map((e) => e.sourceRef)).toEqual([
      "template:studio:team",
      "template:studio:blog",
      "template:studio:hello",
    ]);
    expect(result.activation.entries[0]?.parentId).toBe("old-about");
    // The trashed home page isn't made the home page again.
    expect(result.activation.homepageEntryId).toBeUndefined();
    expect(result.activation.menus?.primary[0]).toMatchObject({
      kind: "entry",
      entryId: "old-about",
    });
  });

  test("a template without a home page of its own puts the latest posts there", () => {
    const { homeRef: _home, ...rest } = starter;
    const result = buildActivation({
      template: { ...template, starter: rest },
      plan: planStarter("studio", rest, [], "/blog", counter("id")),
      choices: all,
      actorId: "admin",
      validate: accept,
      makeBlockId: counter("block"),
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.activation.homepageEntryId).toBeNull();
  });

  test("refuses content the block check refuses", () => {
    const result = buildActivation({
      template,
      plan: planStarter("studio", starter, [], "/blog", counter("id")),
      choices: all,
      actorId: "admin",
      validate: () => ({ ok: false, issues: [] }),
      makeBlockId: counter("block"),
    });
    expect(result).toEqual({ ok: false, error: `The template's "Home" isn't valid content.` });
  });
});
