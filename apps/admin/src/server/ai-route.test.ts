// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { AiQuestionsRequest } from "@sitebuilder/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The checks every /admin/api/ai/* handler makes first, for every role (phase 8 plan, 8.5):
// origin, session, permission, body size, shape; and that a batch is the caller's own.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ SITE_URL: "http://localhost:3100" }) }));
const getViewer = vi.fn();
vi.mock("@/auth/session", () => ({ getViewer: () => getViewer() }));
const getAiBatch = vi.fn();
vi.mock("@sitebuilder/db", () => ({
  db: {},
  getAiBatch: (...args: unknown[]) => getAiBatch(...args),
}));

const { aiRequest, ownBatch } = await import("./ai-route");

const viewer = (role: "admin" | "editor" | "author", id = "u1") => ({
  id,
  role,
  name: "N",
  email: "n@example.com",
});

const request = (body: string, origin = "http://localhost:3100") =>
  new Request("http://localhost:3100/admin/api/ai/questions", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body,
  });

const good = JSON.stringify({ brief: "A website for our bakery in Ghent, with cakes." });

beforeEach(() => {
  getViewer.mockReset();
  getAiBatch.mockReset();
});

describe("an AI request", () => {
  it("is refused from another site", async () => {
    getViewer.mockResolvedValue(viewer("admin"));
    const result = await aiRequest(request(good, "https://evil.example"), AiQuestionsRequest);
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });

  it("is refused without a session", async () => {
    getViewer.mockResolvedValue(null);
    const result = await aiRequest(request(good), AiQuestionsRequest);
    expect(result.ok ? 200 : result.response.status).toBe(401);
  });

  it.each(["editor", "author"] as const)("is refused for an %s", async (role) => {
    getViewer.mockResolvedValue(viewer(role));
    const result = await aiRequest(request(good), AiQuestionsRequest);
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });

  it("refuses a body over 256 KB, JSON that isn't, and a shape that's wrong", async () => {
    getViewer.mockResolvedValue(viewer("admin"));
    const big = JSON.stringify({ brief: "x".repeat(300 * 1024) });
    const status = async (body: string) => {
      const result = await aiRequest(request(body), AiQuestionsRequest);
      return result.ok ? 200 : result.response.status;
    };
    expect(await status(big)).toBe(413);
    expect(await status("{not json")).toBe(400);
    expect(await status(JSON.stringify({ brief: "short" }))).toBe(400);
  });

  it("passes an admin's valid request through, parsed", async () => {
    getViewer.mockResolvedValue(viewer("admin"));
    const result = await aiRequest(request(good), AiQuestionsRequest);
    expect(result.ok && result.input.brief).toContain("bakery");
  });
});

describe("a batch", () => {
  it("is found only for the person who started it, and not once discarded", async () => {
    getAiBatch.mockResolvedValue({ id: "b", createdBy: "someone-else", discardedAt: null });
    const theirs = await ownBatch(viewer("admin"), "b");
    expect(theirs.ok ? 200 : theirs.response.status).toBe(404);

    getAiBatch.mockResolvedValue({ id: "b", createdBy: "u1", discardedAt: new Date() });
    const gone = await ownBatch(viewer("admin"), "b");
    expect(gone.ok ? 200 : gone.response.status).toBe(409);

    getAiBatch.mockResolvedValue({ id: "b", createdBy: "u1", discardedAt: null });
    expect((await ownBatch(viewer("admin"), "b")).ok).toBe(true);
  });
});
