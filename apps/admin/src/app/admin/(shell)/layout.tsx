// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can, canSome } from "@sitebuilder/auth";
import { requireViewer, type Viewer } from "@/auth/session";
import type { NavKey } from "@/components/admin-nav/admin-nav";
import { AdminShell } from "@/components/admin-shell/admin-shell";
import { DateSettingsProvider } from "@/components/date-settings/date-settings";
import { getSiteDates, getSiteSettings } from "@/server/site";

// Which screens the sidebar lists. Each page checks its own permission again: the sidebar
// only hides links, it's never the check.
function navFor(viewer: Viewer): NavKey[] {
  const shows: Record<NavKey, boolean> = {
    dashboard: true,
    pages: canSome(viewer, "page.read"),
    posts: canSome(viewer, "post.read"),
    media: canSome(viewer, "media.read"),
    menus: can(viewer, "menu.update"),
    appearance: can(viewer, "theme.update"),
    users: can(viewer, "user.read"),
    settings: can(viewer, "settings.update"),
    terms: can(viewer, "term.update"),
  };
  return (Object.keys(shows) as NavKey[]).filter((key) => shows[key]);
}

// The frame of every screen. It waits only for who's signed in and the site's settings, both
// read in parallel; each screen's own data streams in behind its loading.tsx skeleton.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Every date in the admin is written in the site's format and zone (decisions #69).
  const [viewer, site, dates] = await Promise.all([
    requireViewer(),
    getSiteSettings(),
    getSiteDates(),
  ]);
  return (
    <DateSettingsProvider value={dates}>
      <AdminShell viewer={viewer} nav={navFor(viewer)} siteTitle={site?.title ?? "Sitebuilder"}>
        {children}
      </AdminShell>
    </DateSettingsProvider>
  );
}
