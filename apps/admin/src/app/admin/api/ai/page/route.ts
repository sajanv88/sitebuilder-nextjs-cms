// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { writePage } from "@sitebuilder/ai/site";
import { can } from "@sitebuilder/auth";
import { newBlockId } from "@sitebuilder/blocks";
import { validateContent } from "@sitebuilder/blocks/server";
import { aiSourceRef, createEntry, db, listAiBatchEntries } from "@sitebuilder/db";
import { AiPageRequest } from "@sitebuilder/schema";
import {
  checkLimits,
  designCatalog,
  designMedia,
  readyProvider,
  runStep,
} from "@/server/ai-design";
import { aiRequest, ownBatch, stepFailure } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Create with AI, step 3: one planned page, written by the model, checked (B7), and stored as a
// draft with the id the plan gave it and the source ref ai:<batch>:<ref>. Its own transaction:
// a page that fails leaves the others (B5.2). Never public: a person publishes it.

// A provider call, a repair, and, for a page too large for one schema, a few more.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiPageRequest);
  if (!req.ok) return req.response;
  const { viewer, input } = req;
  if (!can(viewer, "page.create")) {
    return errorResponse(403, "You can't create pages.");
  }
  const batch = await ownBatch(viewer, input.batchId);
  if (!batch.ok) return batch.response;

  const page = input.plan.pages.find((p) => p.ref === input.ref);
  const id = input.ids[input.ref];
  if (!page || !id) return errorResponse(400, "That page isn't planned.");

  // Written already: the same answer again, so a retry after a lost response is harmless.
  const before = await listAiBatchEntries(db, input.batchId);
  const done = before.find((entry) => entry.ref === page.ref);
  if (done?.inTrash) return errorResponse(409, "That page is in the trash.");
  if (done) return Response.json({ ok: true, entryId: done.id, path: done.path, todos: null });
  // Parents first (B5.2: a tree level at a time), so the child's address is under its parent's.
  if (page.parentRef && !before.some((entry) => entry.ref === page.parentRef && !entry.inTrash)) {
    return errorResponse(409, "Its parent page has to be written first.");
  }

  const ready = await readyProvider();
  if (!ready.ok) return errorResponse(503, ready.message);
  const limits = await checkLimits(viewer, ready.settings, "design");
  if (!limits.ok) return errorResponse(429, limits.message);

  const [{ catalog }, media] = await Promise.all([designCatalog(), designMedia()]);
  const model = ready.settings.model;
  const step = await runStep(viewer, { kind: "page", model, batchId: input.batchId }, () =>
    writePage(
      {
        provider: ready.provider,
        model,
        language: ready.language,
        brief: input.brief,
        signal: request.signal,
      },
      {
        answers: input.answers,
        plan: input.plan,
        ref: page.ref,
        catalog,
        media,
        ids: new Map(Object.entries(input.ids)),
        makeId: newBlockId,
        validate: validateContent,
      },
    ),
  );
  if (!step.ok) return stepFailure(step);

  const written = step.value;
  const entry = {
    id,
    sourceRef: aiSourceRef(input.batchId, page.ref),
    type: "page" as const,
    title: written.title,
    excerpt: written.excerpt,
    seoTitle: written.seoTitle,
    seoDescription: written.seoDescription,
    content: written.blocks,
    parentId: page.parentRef ? (input.ids[page.parentRef] ?? null) : null,
    featuredMediaId: null,
    categoryIds: [],
    tagIds: [],
    authorId: viewer.id,
    actorId: viewer.id,
  };
  let created = await createEntry(db, { ...entry, slug: written.slug });
  // A slug the site keeps for itself: one from the title instead.
  if (!created.ok && created.error === "reserved-slug") {
    created = await createEntry(db, { ...entry, slug: "" });
  }
  if (!created.ok) {
    return errorResponse(409, `The page couldn't be saved (${created.error}).`);
  }
  return Response.json({
    ok: true,
    entryId: created.id,
    path: created.path,
    todos: written.todos,
  });
}
