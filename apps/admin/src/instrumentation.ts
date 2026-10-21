// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { registerOTel } from "@vercel/otel";
import type { Instrumentation } from "next";

export async function register() {
  // The exporter is configured at runtime by the standard OTEL_EXPORTER_OTLP_* variables.
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? "admin" });

  // Validate the environment once at server start, so a missing or bad variable stops the
  // server with a message naming it (design §9). Not during `next build`, which needs none.
  // Next logs a throw from here but keeps the process up, so exit: the container restarts or
  // stays down, instead of answering every request with an error.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { env } = await import("./env");
    try {
      env();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // One JSON line per unhandled error. The digest matches what error.tsx shows the user.
  console.error(
    JSON.stringify({
      level: "error",
      msg: error instanceof Error ? error.message : String(error),
      digest: (error as { digest?: string }).digest,
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      routePath: context.routePath,
    }),
  );
};
