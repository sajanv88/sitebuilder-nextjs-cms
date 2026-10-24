// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  describeImage,
  rewriteBlocks,
  type StepResult,
  suggestSeo,
  tooLarge,
} from "@sitebuilder/ai/site";
import { collectEntryIds, newBlockId } from "@sitebuilder/blocks";
import { validateContent } from "@sitebuilder/blocks/server";
import { db, getEntryLinks } from "@sitebuilder/db";
import { AiHelpRequest, type Block } from "@sitebuilder/schema";
import { findBlock, locate } from "@/components/block-editor/editor-model";
import { checkLimits, designCatalog, readyProvider, runStep } from "@/server/ai-design";
import { blocksText, HELP, helpAllowed, helpMedia, readPicture } from "@/server/ai-help";
import { aiRequest, stepFailure } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Help on a page (phase 8 plan, 8.7): rewrite blocks, suggest the search text, describe a
// picture. In order: origin, session, help at all, the body, valibot (aiRequest); then the
// entry and help on it (B8), the blocks as a save checks them, the provider, the limits (B9).
// The answer is a proposal for the editor: nothing is saved here.

// A provider call and a repair.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiHelpRequest, HELP);
  if (!req.ok) return req.response;
  const { viewer, input } = req;
  const allowed = await helpAllowed(viewer, input);
  if (!allowed.ok) return allowed.response;

  const content = validateContent(input.content);
  if (!content.ok) {
    return errorResponse(400, "Some blocks need attention first: the editor marks them on save.");
  }
  const blocks = content.value;

  const ready = await readyProvider();
  if (!ready.ok) return errorResponse(503, ready.message);
  if (input.kind === "alt" && !ready.settings.supportsImages) {
    return errorResponse(400, "The AI model in Settings doesn't take pictures.");
  }
  const limits = await checkLimits(viewer, ready.settings, "help");
  if (!limits.ok) return errorResponse(429, limits.message);

  const model = ready.settings.model;
  const context = {
    provider: ready.provider,
    model,
    language: ready.language,
    signal: request.signal,
  };
  const run = { kind: input.kind, model, ...(input.entryId ? { entryId: input.entryId } : {}) };
  const title = input.title.trim() || "(untitled)";

  if (input.kind === "seo") {
    const step = await runStep(viewer, run, () =>
      suggestSeo(context, { title, text: blocksText(blocks) }),
    );
    return step.ok ? Response.json({ ok: true, ...step.value }) : stepFailure(step);
  }

  if (input.kind === "alt") {
    const picture = await readPicture(blocks, input.mediaId);
    if (!picture.ok) return errorResponse(picture.status, picture.message);
    const step = await runStep(viewer, run, () =>
      describeImage(context, {
        image: picture.image,
        filename: picture.filename,
        pageTitle: title,
        pageText: blocksText(blocks),
        max: input.max,
      }),
    );
    return step.ok ? Response.json({ ok: true, alt: step.value.alt }) : stepFailure(step);
  }

  // Rewrite: one block (a column's columns, which hold it), or the page.
  let target: readonly Block[] = blocks;
  let nested = false;
  if (input.blockId) {
    const where = locate(blocks, input.blockId);
    const found = findBlock(blocks, input.blockId);
    if (!found || !where) return errorResponse(404, "That block isn't on the page any more.");
    const columns = found.type === "column" ? where.parent : null;
    target = [columns ?? found];
    // Inside a section or a column (not the columns themselves, which sit on the page). A
    // location's parent is null at the top of the page.
    const parent = columns ? (locate(blocks, columns.id)?.parent ?? null) : where.parent;
    nested = parent !== null;
  }
  const [{ catalog }, media, links] = await Promise.all([
    designCatalog(),
    helpMedia(target),
    getEntryLinks(db, collectEntryIds(target)),
  ]);
  const step: StepResult<{ blocks: Block[] }> = await runStep(viewer, run, () =>
    rewriteBlocks(context, {
      title,
      instruction: input.instruction,
      blocks: target,
      nested,
      pageText: blocksText(blocks),
      linkTitles: new Map([...links.values()].map((link) => [link.id, link.title])),
      catalog,
      media,
      makeId: newBlockId,
      validate: validateContent,
    }),
  );
  if (!step.ok) {
    if (tooLarge(step)) {
      return errorResponse(
        400,
        "This page has too many kinds of block to rewrite at once. Select a section or a block and rewrite that.",
      );
    }
    return stepFailure(step);
  }
  return Response.json({ ok: true, blocks: step.value.blocks, replaces: target[0]?.id ?? null });
}
