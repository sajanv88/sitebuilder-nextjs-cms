// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may have help on which entry (B8), and the words of a page the assistant reads.

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ SITE_URL: "http://localhost:3100" }) }));
const authorizeEntry = vi.fn();
vi.mock("@/server/entries", () => ({
  authorizeEntry: (...args: unknown[]) => authorizeEntry(...args),
}));
vi.mock("@/server/ai-design", () => ({ designMedia: async () => [] }));
vi.mock("@/server/media", () => ({
  renderMedia: async () => ({}),
  storageOfFile: vi.fn(),
  storageProblem: () => "",
}));
const getMedia = vi.fn();
vi.mock("@sitebuilder/db", () => ({ db: {}, getMedia: (...args: unknown[]) => getMedia(...args) }));

const { blocksText, HELP, helpAllowed, readPicture } = await import("./ai-help");

const viewer = (role: "admin" | "editor" | "author", id = "u1") => ({
  id,
  role,
  name: "N",
  email: "n@example.com",
});
const POST = "11111111-1111-4111-8111-111111111111";
const IMAGE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  authorizeEntry.mockReset();
  getMedia.mockReset();
});

describe("help on an entry", () => {
  it("is offered to every role, on at least their own posts", () => {
    for (const role of ["admin", "editor", "author"] as const) {
      expect(HELP.allowed(viewer(role))).toBe(true);
    }
  });

  it("lets an author have help on their own post and not on another's", async () => {
    authorizeEntry.mockResolvedValue({ type: "post", authorId: "u1" });
    expect(await helpAllowed(viewer("author"), { entryId: POST, type: "post" })).toEqual({
      ok: true,
    });
    // Someone else's post: the edit check itself refuses an author.
    authorizeEntry.mockResolvedValue(undefined);
    const other = await helpAllowed(viewer("author"), { entryId: POST, type: "post" });
    expect(other.ok).toBe(false);
  });

  it("lets an editor have help on anyone's entry", async () => {
    authorizeEntry.mockResolvedValue({ type: "page", authorId: "someone-else" });
    expect(await helpAllowed(viewer("editor"), { entryId: POST, type: "page" })).toEqual({
      ok: true,
    });
  });

  it("refuses an entry of another type, and a new page for an author", async () => {
    authorizeEntry.mockResolvedValue({ type: "page", authorId: "u1" });
    expect((await helpAllowed(viewer("admin"), { entryId: POST, type: "post" })).ok).toBe(false);
    expect((await helpAllowed(viewer("author"), { entryId: "", type: "page" })).ok).toBe(false);
    expect((await helpAllowed(viewer("author"), { entryId: "", type: "post" })).ok).toBe(true);
  });
});

describe("the page's words", () => {
  it("reads what visitors read, not ids, links or settings", () => {
    const text = blocksText([
      { id: "b0000001", type: "heading", props: { text: "Our bread", level: 2 } },
      {
        id: "b0000002",
        type: "section",
        props: { background: "muted" },
        children: [
          { id: "b0000003", type: "rich-text", props: { html: "<p>Sourdough &amp; rye</p>" } },
        ],
      },
      {
        id: "b0000004",
        type: "button",
        props: { label: "Visit us", href: { kind: "entry", entryId: POST } },
      },
    ]);
    expect(text).toBe("Our bread\nSourdough & rye\nVisit us");
  });
});

describe("a picture for alt text", () => {
  it("must be on the page, and of a type and size providers take", async () => {
    const blocks = [{ id: "b0000001", type: "image", props: { mediaId: IMAGE } }];
    expect(await readPicture([], IMAGE)).toMatchObject({ ok: false, status: 400 });
    getMedia.mockResolvedValue({ mimeType: "image/svg+xml", sizeBytes: 10 });
    expect(await readPicture(blocks, IMAGE)).toMatchObject({ ok: false, status: 400 });
    getMedia.mockResolvedValue({ mimeType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 });
    expect(await readPicture(blocks, IMAGE)).toMatchObject({
      ok: false,
      message: expect.stringContaining("4 MB"),
    });
  });
});
