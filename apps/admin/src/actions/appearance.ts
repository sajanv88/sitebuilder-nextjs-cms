// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import { db, upsertSettings } from "@sitebuilder/db";
import { ThemeSettings } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { invalidate } from "@/server/invalidate";

// Appearance (design §5.4): the preset, light or dark, density, and token overrides. Admins and
// editors (§6.2: theme.update). The values reach the page as CSS, so ThemeSettings checks every
// token's name and value before anything is stored.

export type SaveThemeResult = { ok: true } | { ok: false; error: string };

export async function saveTheme(input: unknown): Promise<SaveThemeResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session has ended. Sign in again." };
  if (!can(viewer, "theme.update")) return { ok: false, error: "You can't change the theme." };
  const theme = v.safeParse(ThemeSettings, input);
  if (!theme.success) {
    return { ok: false, error: "A token's name or value isn't allowed. Check the marked rows." };
  }
  const saved = await upsertSettings(db, "theme", theme.output);
  if (!saved.ok) return { ok: false, error: "The theme couldn't be saved." };
  invalidate("saveTheme");
  return { ok: true };
}
