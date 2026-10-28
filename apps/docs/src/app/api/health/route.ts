// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { connection } from "next/server";

// Liveness and readiness for Docker's HEALTHCHECK and the Kubernetes probes. It answers
// without touching any dependency.
export async function GET() {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
