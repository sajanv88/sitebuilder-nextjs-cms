// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The presets, for the preview and the swatches. Each does nothing until an element names it
// with data-preset, so loading them here changes no other screen.
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";

import { db, getSettings } from "@sitebuilder/db";
import { defaultSettings } from "@sitebuilder/schema";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { AppearanceForm } from "@/components/appearance-form/appearance-form";
import { env } from "@/env";

export const metadata: Metadata = { title: "Appearance" };

// The site's look (design §5.4). theme.update covers this screen (§6.1).
export default async function AppearancePage() {
  await requirePermission("theme.update");
  const theme = (await getSettings(db, "theme")) ?? defaultSettings(env().SITE_URL).theme;
  return (
    <AdminPage
      title="Appearance"
      description="How the public site looks: a theme, light or dark, how roomy controls are, and your own colors. The preview shows each change before you save."
      width="wide"
    >
      <AppearanceForm initial={theme} />
    </AdminPage>
  );
}
