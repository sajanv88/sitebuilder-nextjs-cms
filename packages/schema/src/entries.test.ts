// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { ChangePasswordInput, NewUserInput } from "./accounts";
import {
  EntryFields,
  EntryListQuery,
  isReservedRootSlug,
  PublishAt,
  pagePath,
  postPath,
  Slug,
  SlugField,
  slugify,
  UpdatedAt,
  withSuffix,
} from "./entries";

const uuid = "4f1c2a9e-8b7d-4c3e-9a1f-2b3c4d5e6f70";

describe("Slug", () => {
  test.each(["about", "a", "hello-world", "2026", "a-b-c1"])("accepts %s", (slug) => {
    expect(v.is(Slug, slug)).toBe(true);
  });

  test.each(["", "-about", "about-", "About", "über", "a b", "a_b", "x".repeat(81)])(
    "rejects %j",
    (slug) => {
      expect(v.is(Slug, slug)).toBe(false);
    },
  );

  test("the form field accepts empty, and lowercases and trims", () => {
    expect(v.parse(SlugField, "")).toBe("");
    expect(v.parse(SlugField, "  Hello-World ")).toBe("hello-world");
    expect(v.is(SlugField, "hello world")).toBe(false);
  });
});

describe("slugify", () => {
  test.each([
    ["Hello, World!", "hello-world"],
    ["Crème brûlée & Co.", "creme-brulee-co"],
    ["  --Spaces -- and dashes--  ", "spaces-and-dashes"],
    ["2026: the year", "2026-the-year"],
    ["日本語", "untitled"],
    ["", "untitled"],
  ])("%j → %s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  test("never longer than 80 characters, and never ends in a hyphen", () => {
    const slug = slugify(`${"word ".repeat(30)}`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(v.is(Slug, slug)).toBe(true);
  });

  test("withSuffix keeps the result within 80 characters", () => {
    expect(withSuffix("about", 2)).toBe("about-2");
    const long = withSuffix("a".repeat(80), 12);
    expect(long).toHaveLength(80);
    expect(long.endsWith("-12")).toBe(true);
  });
});

describe("paths", () => {
  test("pages nest under their parent, posts under the posts path", () => {
    expect(pagePath(null, "about")).toBe("/about");
    expect(pagePath("/about", "team")).toBe("/about/team");
    expect(postPath("/blog", "hello")).toBe("/blog/hello");
  });

  test("a root page can't take a reserved segment or the posts path", () => {
    for (const slug of ["admin", "admin-static", "setup", "api", "media", "blog"]) {
      expect(isReservedRootSlug(slug, "/blog")).toBe(true);
    }
    expect(isReservedRootSlug("about", "/blog")).toBe(false);
    expect(isReservedRootSlug("blog", "/news")).toBe(false);
  });
});

describe("EntryFields", () => {
  const valid = {
    title: "  Hello  ",
    slug: "",
    excerpt: "",
    seoTitle: "",
    seoDescription: "Short",
    parentId: "",
    categoryIds: [uuid],
    tagIds: [],
  };

  test("trims, and turns empty optional fields into null", () => {
    expect(v.parse(EntryFields, valid)).toEqual({
      title: "Hello",
      slug: "",
      excerpt: null,
      seoTitle: null,
      seoDescription: "Short",
      parentId: null,
      categoryIds: [uuid],
      tagIds: [],
    });
  });

  test("rejects an empty title, long SEO fields and bad ids", () => {
    expect(v.is(EntryFields, { ...valid, title: "   " })).toBe(false);
    expect(v.is(EntryFields, { ...valid, seoTitle: "x".repeat(71) })).toBe(false);
    expect(v.is(EntryFields, { ...valid, parentId: "not-a-uuid" })).toBe(false);
    expect(v.is(EntryFields, { ...valid, tagIds: ["x"] })).toBe(false);
  });
});

test("UpdatedAt and PublishAt take ISO timestamps", () => {
  const at = "2026-10-21T08:30:00.123Z";
  expect(v.parse(UpdatedAt, at)).toEqual(new Date(at));
  expect(v.is(UpdatedAt, "yesterday")).toBe(false);
  expect(v.parse(PublishAt, "")).toBeNull();
  expect(v.parse(PublishAt, at)).toEqual(new Date(at));
});

describe("EntryListQuery", () => {
  test("defaults", () => {
    expect(v.parse(EntryListQuery, {})).toEqual({
      view: "all",
      sort: "-date",
      page: 1,
      size: 20,
      q: "",
    });
  });

  test("reads the URL's strings", () => {
    expect(
      v.parse(EntryListQuery, { view: "trash", sort: "title", page: "3", size: "50", q: " x " }),
    ).toEqual({ view: "trash", sort: "title", page: 3, size: 50, q: "x" });
  });

  test("an untrusted value falls back to the default instead of failing", () => {
    expect(
      v.parse(EntryListQuery, {
        view: "everything",
        sort: "password_hash",
        page: "-1",
        size: "1000",
      }),
    ).toEqual({ view: "all", sort: "-date", page: 1, size: 20, q: "" });
  });
});

test("NewUserInput and ChangePasswordInput", () => {
  expect(
    v.is(NewUserInput, {
      name: "Grace",
      email: "grace@example.com",
      role: "author",
      password: "a long enough password",
    }),
  ).toBe(true);
  expect(
    v.is(NewUserInput, {
      name: "Grace",
      email: "grace@example.com",
      role: "owner",
      password: "a long enough password",
    }),
  ).toBe(false);
  expect(v.is(ChangePasswordInput, { currentPassword: "", newPassword: "x".repeat(12) })).toBe(
    false,
  );
});
