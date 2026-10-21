// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { getViewer, type Viewer } from "@/auth/session";
import { env } from "@/env";

// For the admin's own route handlers under /admin/api/. Server Actions compare Origin with Host
// for us; route handlers don't (nextjs-security rule 8), so a state-changing one checks that
// the request comes from this site's pages before it reads the session cookie.

export type Guarded = { ok: true; viewer: Viewer } | { ok: false; response: Response };

const refuse = (status: number, error: string): { ok: false; response: Response } => ({
  ok: false,
  response: Response.json({ ok: false, error }, { status }),
});

export async function guardRequest(request: Request): Promise<Guarded> {
  const origin = request.headers.get("origin");
  if (origin !== new URL(env().SITE_URL).origin) return refuse(403, "Not allowed from here.");
  const viewer = await getViewer();
  if (!viewer) return refuse(401, "Your session has ended. Sign in again.");
  return { ok: true, viewer };
}

export const errorResponse = (status: number, error: string): Response =>
  Response.json({ ok: false, error }, { status });
