// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Route } from "next";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";

// "Leave preview": turns draft mode off and goes back to the page, which visitors may or may
// not be able to see. Only a site path is followed (nextjs-security rule 9).

function safePath(value: string | null): string {
  return value && /^\/(?![/\\])[^\s]*$/.test(value) ? value : "/";
}

export async function GET(request: Request): Promise<never> {
  (await draftMode()).disable();
  const path = safePath(new URL(request.url).searchParams.get("path"));
  redirect(new URL(path, env().SITE_URL).toString() as Route);
}
