// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { db, discardAiBatch } from "@sitebuilder/db";
import { AiDiscardRequest } from "@sitebuilder/schema";
import { aiRequest, invalidateDesign, ownBatch } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Discard a site designed with AI (B5.2): its pages to the trash, and the menus, home page and
// title finishing changed put back. Pages someone has changed since are kept and listed, unless
// the admin, asked, includes them.

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiDiscardRequest);
  if (!req.ok) return req.response;
  const { viewer, input } = req;
  if (!can(viewer, "page.trash")) return errorResponse(403, "You can't move pages to the trash.");
  const batch = await ownBatch(viewer, input.batchId);
  if (!batch.ok) return batch.response;

  const result = await discardAiBatch(db, input.batchId, input.includeEdited);
  if (!result.ok) return errorResponse(409, "That site design was discarded already.");
  invalidateDesign();
  return Response.json({
    ok: true,
    trashed: result.trashed,
    kept: result.kept.map((entry) => ({ id: entry.id, title: entry.title })),
  });
}
