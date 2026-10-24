// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomUUID } from "node:crypto";
import { planSite } from "@sitebuilder/ai/site";
import { createAiBatch, db } from "@sitebuilder/db";
import { AiPlanRequest } from "@sitebuilder/schema";
import {
  checkLimits,
  designCatalog,
  designMedia,
  readyProvider,
  runStep,
} from "@/server/ai-design";
import { aiRequest, stepFailure } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Create with AI, step 2: the plan, from the description and the answers. It starts a batch
// (B9: three a day per user) and gives each planned page the entry id it will have (B5.2), so
// pages can link to each other before they exist.

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiPlanRequest);
  if (!req.ok) return req.response;
  const { viewer, input } = req;

  const ready = await readyProvider();
  if (!ready.ok) return errorResponse(503, ready.message);
  const limits = await checkLimits(viewer, ready.settings, true);
  if (!limits.ok) return errorResponse(429, limits.message);

  const [{ catalog }, media] = await Promise.all([designCatalog(), designMedia()]);
  const batchId = await createAiBatch(db, viewer.id);
  const model = ready.settings.model;
  const step = await runStep(viewer, { kind: "plan", model, batchId }, () =>
    planSite(
      {
        provider: ready.provider,
        model,
        language: ready.language,
        brief: input.brief,
        signal: request.signal,
      },
      input.answers,
      catalog,
      media,
    ),
  );
  if (!step.ok) return stepFailure(step);
  const ids = Object.fromEntries(step.value.pages.map((page) => [page.ref, randomUUID()]));
  return Response.json({ ok: true, batchId, plan: step.value, ids });
}
