// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { newBlockId } from "@sitebuilder/blocks";
import { db, finishAiBatch, listAiBatchEntries } from "@sitebuilder/db";
import { AiFinishRequest, type Menu } from "@sitebuilder/schema";
import { aiRequest, invalidateDesign, ownBatch } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Create with AI, last step (B5.2): what the admin ticks of the plan's menus, its home page and
// its site title, applied in one transaction. What they replace is kept, so discarding the
// design puts it back. Only pages that were written are linked.

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiFinishRequest);
  if (!req.ok) return req.response;
  const { viewer, input } = req;
  if (input.menus && !can(viewer, "menu.update")) {
    return errorResponse(403, "You can't change menus.");
  }
  if ((input.homepage || input.siteTitle) && !can(viewer, "settings.update")) {
    return errorResponse(403, "You can't change settings.");
  }
  const batch = await ownBatch(viewer, input.batchId);
  if (!batch.ok) return batch.response;

  const written = new Map(
    (await listAiBatchEntries(db, input.batchId))
      .filter((entry) => !entry.inTrash)
      .map((entry) => [entry.ref, entry]),
  );
  const titles = new Map(input.plan.pages.map((page) => [page.ref, page.title]));
  const menu = (refs: readonly string[]): Menu =>
    refs.flatMap((ref) => {
      const entry = written.get(ref);
      return entry
        ? [
            {
              id: newBlockId(),
              label: (titles.get(ref) ?? entry.title).slice(0, 80),
              kind: "entry" as const,
              entryId: entry.id,
            },
          ]
        : [];
    });
  const home = written.get(input.plan.pages[0]?.ref ?? "");
  // A title the model left as a marker isn't a title.
  const titled = !/\[TODO/i.test(input.plan.siteTitle);

  const result = await finishAiBatch(db, {
    batchId: input.batchId,
    menus: input.menus
      ? { primary: menu(input.plan.primaryMenu), footer: menu(input.plan.footerMenu) }
      : undefined,
    homepageEntryId: input.homepage && home ? home.id : undefined,
    site:
      input.siteTitle && titled
        ? { title: input.plan.siteTitle, tagline: input.plan.tagline }
        : undefined,
  });
  if (!result.ok) {
    const message = {
      "not-found": "That site design wasn't found.",
      finished: "That site design is finished already.",
      discarded: "That site design was discarded.",
      invalid: "The menus or settings couldn't be saved.",
    }[result.error];
    return errorResponse(result.error === "invalid" ? 400 : 409, message);
  }
  invalidateDesign();
  return Response.json({ ok: true });
}
