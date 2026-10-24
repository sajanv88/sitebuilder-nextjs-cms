// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { AI_ERROR_MESSAGES } from "@sitebuilder/ai";
import type { StepResult } from "@sitebuilder/ai/site";
import { can } from "@sitebuilder/auth";
import { db, getAiBatch } from "@sitebuilder/db";
import { CacheTags } from "@sitebuilder/schema";
import { revalidateTag } from "next/cache";
import * as v from "valibot";
import type { Viewer } from "@/auth/session";
import { errorResponse, guardRequest } from "@/server/route-guard";

// The checks every /admin/api/ai/* handler makes, in this order (templates_and_ai_design B5.1):
// the request's origin, a session, the permission, the body's size, its shape. The limits and
// the work follow in each handler. Route handlers, not Server Actions, because a client's
// Server Actions run one at a time and pages are written three at once.

// B9.
const MAX_BODY_BYTES = 256 * 1024;

export type AiRequest<T> =
  | { ok: true; viewer: Viewer; input: T }
  | { ok: false; response: Response };

// The body as text, refused past the cap without reading the rest.
async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Who may make the request: designing a site unless the handler says otherwise (help on a page
// checks the entry itself afterwards).
export interface AiPermit {
  allowed: (viewer: Viewer) => boolean;
  refusal: string;
}

const DESIGN: AiPermit = {
  allowed: (viewer) => can(viewer, "ai.generateSite"),
  refusal: "You can't design a site with AI.",
};

export async function aiRequest<T>(
  request: Request,
  schema: v.GenericSchema<unknown, T>,
  permit: AiPermit = DESIGN,
): Promise<AiRequest<T>> {
  const guard = await guardRequest(request);
  if (!guard.ok) return guard;
  const { viewer } = guard;
  if (!permit.allowed(viewer)) {
    return { ok: false, response: errorResponse(403, permit.refusal) };
  }
  const text = await readCapped(request);
  if (text === null)
    return { ok: false, response: errorResponse(413, "That request is too large.") };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: errorResponse(400, "Send the request as JSON.") };
  }
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) {
    return { ok: false, response: errorResponse(400, "That request isn't valid.") };
  }
  return { ok: true, viewer, input: parsed.output };
}

// The batch, if it's this person's and still open.
export async function ownBatch(
  viewer: Viewer,
  batchId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const batch = await getAiBatch(db, batchId);
  if (!batch || batch.createdBy !== viewer.id) {
    return { ok: false, response: errorResponse(404, "That site design wasn't found.") };
  }
  if (batch.discardedAt) {
    return { ok: false, response: errorResponse(409, "That site design was discarded.") };
  }
  return { ok: true };
}

// A failed step as a response: the provider's problem in words a person can act on, or that
// the answer wasn't usable even after a repair (B2, B7). The provider's own words are left out:
// they may say more than an editor needs.
export function stepFailure(step: StepResult<unknown> & { ok: false }): Response {
  if (step.error) {
    const status = step.error.code === "rate_limited" || step.error.code === "limit" ? 429 : 502;
    return Response.json(
      { ok: false, error: AI_ERROR_MESSAGES[step.error.code], code: step.error.code },
      { status },
    );
  }
  return Response.json(
    { ok: false, error: AI_ERROR_MESSAGES.invalid_output, code: "invalid_output" },
    { status: 502 },
  );
}

// What finishing or discarding a design changes on the public site: its menus, the home page,
// and the site's title. Route handlers expire tags at once with revalidateTag (updateTag is for
// Server Actions).
export function invalidateDesign(): void {
  for (const tag of [
    CacheTags.menu("primary"),
    CacheTags.menu("footer"),
    CacheTags.settings,
    CacheTags.entries,
  ]) {
    revalidateTag(tag, { expire: 0 });
  }
}
