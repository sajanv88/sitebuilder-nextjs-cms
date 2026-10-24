// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { askQuestions } from "@sitebuilder/ai/site";
import { AiQuestionsRequest } from "@sitebuilder/schema";
import { checkLimits, designCatalog, readyProvider, runStep } from "@/server/ai-design";
import { aiRequest, stepFailure } from "@/server/ai-route";
import { errorResponse } from "@/server/route-guard";

// Create with AI, step 1: the model's questions about the site the admin described.

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  const req = await aiRequest(request, AiQuestionsRequest);
  if (!req.ok) return req.response;
  const { viewer, input } = req;

  const ready = await readyProvider();
  if (!ready.ok) return errorResponse(503, ready.message);
  const limits = await checkLimits(viewer, ready.settings, "design");
  if (!limits.ok) return errorResponse(429, limits.message);

  const { template } = await designCatalog();
  const model = ready.settings.model;
  const step = await runStep(viewer, { kind: "questions", model }, () =>
    askQuestions(
      {
        provider: ready.provider,
        model,
        language: ready.language,
        brief: input.brief,
        signal: request.signal,
      },
      template,
    ),
  );
  if (!step.ok) return stepFailure(step);
  return Response.json({ ok: true, interview: step.value });
}
