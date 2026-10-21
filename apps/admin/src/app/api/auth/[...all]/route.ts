// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { auth } from "@/auth/auth";

// Better Auth's endpoints under /api/auth (the site zone forwards them here). Better Auth checks
// Origin against trustedOrigins on state-changing requests and rate-limits sign-in.
export async function GET(request: Request): Promise<Response> {
  return auth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return auth().handler(request);
}
