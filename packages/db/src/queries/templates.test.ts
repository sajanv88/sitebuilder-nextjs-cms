// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";
import { DEFAULT_TEMPLATE } from "@sitebuilder/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { entries } from "../schema/entries";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { createEntry, trashEntry } from "./entries";
import { getMenu } from "./menus";
import { getReading } from "./public";
import { deleteSettings, getSettings, upsertSettings } from "./settings";
import {
  activateTemplate,
  findTakenPaths,
  getTemplateSettings,
  listImportedEntries,
  type TemplateActivation,
  type TemplateEntryWrite,
} from "./templates";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: TestDb;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  const setup = await bootstrapSite(db, {
    name: "Ada",
    email: "ada@example.com",
    passwordHash: "x",
    siteUrl: "https://example.com",
    allowExistingUsers: false,
  });
  if (!setup.ok) throw new Error("setup failed");
  adminId = setup.userId;
});

function page(ref: string, slug: string, parentId: string | null = null): TemplateEntryWrite {
  return {
    id: randomUUID(),
    sourceRef: `template:studio:${ref}`,
    type: "page",
    parentId,
    title: slug[0]?.toUpperCase() + slug.slice(1),
    slug,
    excerpt: null,
    seoTitle: null,
    seoDescription: null,
    content: [{ id: `heading-${ref}`, type: "heading", props: { text: slug, level: 2 } }],
  };
}

function activation(overrides: Partial<TemplateActivation> = {}): TemplateActivation {
  const about = page("about", "about");
  return {
    actorId: adminId,
    template: { slug: "studio", options: {} },
    entries: [page("home", "home"), about, page("team", "team", about.id)],
    publish: false,
    ...overrides,
  };
}

async function status(id: string) {
  const [row] = await db.select().from(entries).where(eq(entries.id, id));
  return row;
}

describe("getTemplateSettings", () => {
  it("is the default template for a site set up before templates", async () => {
    await deleteSettings(db, "template");
    expect(await getTemplateSettings(db)).toEqual(DEFAULT_TEMPLATE);
  });
});

describe("activateTemplate", () => {
  it("writes the template, its pages as drafts with their chosen ids, and nothing else asked", async () => {
    const input = activation();
    const result = await activateTemplate(db, input);
    expect(result).toMatchObject({
      ok: true,
      created: [{ path: "/home" }, { path: "/about" }, { path: "/about/team" }],
    });
    expect(await getTemplateSettings(db)).toEqual({ slug: "studio", options: {} });
    const team = await status(input.entries[2]?.id ?? "");
    expect(team).toMatchObject({ status: "draft", sourceRef: "template:studio:team" });
    expect((await getSettings(db, "theme"))?.preset).toBe("default");
    expect(await getMenu(db, "primary")).toEqual([]);
    expect((await getReading(db)).homepageEntryId).toBeNull();
  });

  it("writes the theme, menus and home page when asked, and publishes when asked", async () => {
    // The site's own CSS outlives a template's colours.
    const before = await getSettings(db, "theme");
    if (!before) throw new Error("no theme");
    const font = {
      family: "Inter",
      files: [{ mediaId: randomUUID(), weight: "400" as const, style: "normal" as const }],
      use: "text" as const,
    };
    await upsertSettings(db, "theme", {
      ...before,
      customCss: "body { margin: 0; }",
      fonts: [font],
    });
    const input = activation({ publish: true });
    const home = input.entries[0]?.id ?? "";
    const result = await activateTemplate(db, {
      ...input,
      theme: { preset: "ember", mode: "light", density: "default", tokens: {} },
      menus: {
        primary: [{ id: "item-0001", label: "Home", kind: "entry", entryId: home }],
        footer: [],
      },
      homepageEntryId: home,
    });
    expect(result.ok).toBe(true);
    expect((await getSettings(db, "theme"))?.preset).toBe("ember");
    expect((await getSettings(db, "theme"))?.customCss).toBe("body { margin: 0; }");
    expect((await getSettings(db, "theme"))?.fonts).toEqual([font]);
    expect(await getMenu(db, "primary")).toHaveLength(1);
    expect((await getReading(db)).homepageEntryId).toBe(home);
    expect((await status(home))?.status).toBe("published");
  });

  it("puts the latest posts back on the home page when asked", async () => {
    const input = activation();
    await activateTemplate(db, { ...input, homepageEntryId: input.entries[0]?.id });
    expect((await getReading(db)).homepageEntryId).not.toBeNull();
    const again = await activateTemplate(db, {
      ...activation(),
      entries: [],
      homepageEntryId: null,
    });
    expect(again.ok).toBe(true);
    expect((await getReading(db)).homepageEntryId).toBeNull();
  });

  it("gives a page whose path is taken a numbered slug", async () => {
    const mine = await createEntry(db, {
      type: "page",
      title: "About",
      slug: "about",
      content: [],
      featuredMediaId: null,
      excerpt: null,
      seoTitle: null,
      seoDescription: null,
      parentId: null,
      categoryIds: [],
      tagIds: [],
      authorId: adminId,
      actorId: adminId,
    });
    expect(mine.ok).toBe(true);
    const result = await activateTemplate(db, activation());
    expect(result).toMatchObject({
      ok: true,
      created: [{ path: "/home" }, { path: "/about-2" }, { path: "/about-2/team" }],
    });
  });

  it("refuses the same source ref twice, and the second run changes nothing", async () => {
    expect((await activateTemplate(db, activation())).ok).toBe(true);
    const again = await activateTemplate(db, {
      ...activation(),
      template: { slug: "other", options: {} },
    });
    expect(again).toMatchObject({ ok: false, sourceRef: "template:studio:home" });
    expect((await getTemplateSettings(db)).slug).toBe("studio");
  });

  it("rolls back every write when one entry is refused", async () => {
    const input = activation({
      theme: { preset: "ink", mode: "dark", density: "compact", tokens: {} },
    });
    const admin = page("admin", "admin");
    const result = await activateTemplate(db, { ...input, entries: [...input.entries, admin] });
    expect(result).toEqual({
      ok: false,
      error: "reserved-slug",
      sourceRef: "template:studio:admin",
    });
    expect(await status(input.entries[0]?.id ?? "")).toBeUndefined();
    expect((await getTemplateSettings(db)).slug).toBe("default");
    expect((await getSettings(db, "theme"))?.preset).toBe("default");
  });
});

describe("listImportedEntries", () => {
  it("lists what this template created, trashed entries included, and nothing else", async () => {
    const input = activation();
    await activateTemplate(db, input);
    await trashEntry(db, input.entries[2]?.id ?? "");
    const listed = await listImportedEntries(db, "studio");
    expect(listed.map((row) => [row.sourceRef, row.trashed]).sort()).toEqual([
      ["template:studio:about", false],
      ["template:studio:home", false],
      ["template:studio:team", true],
    ]);
    expect(await listImportedEntries(db, "stud")).toEqual([]);
  });
});

describe("findTakenPaths", () => {
  it("names the paths live entries have, and not trashed ones", async () => {
    const input = activation();
    await activateTemplate(db, input);
    await trashEntry(db, input.entries[0]?.id ?? "");
    expect(await findTakenPaths(db, ["/home", "/about", "/nowhere"])).toEqual(new Set(["/about"]));
    expect(await findTakenPaths(db, [])).toEqual(new Set());
  });
});
