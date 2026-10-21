// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type Env, parseEnv } from "@sitebuilder/schema";

// Runtime configuration, read on the server only (design §9). Values come from compose, the
// chart's ConfigMap and the app's Secret. NEXT_PUBLIC_* values are build-time constants and
// don't belong here.

let parsed: Env | undefined;

// Parsed on first use, not at import, so `next build` never needs runtime secrets.
// instrumentation.ts calls it once at server start, so a bad value stops the server there.
export function env(): Env {
  if (parsed) return parsed;
  const result = parseEnv(process.env);
  if (!result.ok) throw new Error(result.message);
  parsed = result.env;
  return parsed;
}
