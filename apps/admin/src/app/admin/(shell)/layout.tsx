import { can, canSome } from "@sitebuilder/auth";
import { db, getSettings } from "@sitebuilder/db";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_ZONE } from "@sitebuilder/schema";
import { requireViewer, type Viewer } from "@/auth/session";
import type { NavKey } from "@/components/admin-nav/admin-nav";
import { AdminShell } from "@/components/admin-shell/admin-shell";
import { DateSettingsProvider } from "@/components/date-settings/date-settings";

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

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireViewer();
  // Every date in the admin is written in the site's format and zone (decisions #69).
  const site = await getSettings(db, "site");
  const dates = {
    dateFormat: site?.dateFormat ?? DEFAULT_DATE_FORMAT,
    timeZone: site?.timeZone ?? DEFAULT_TIME_ZONE,
    language: site?.language ?? "en",
  };
  return (
    <DateSettingsProvider value={dates}>
      <AdminShell viewer={viewer} nav={navFor(viewer)} siteTitle={site?.title ?? "Sitebuilder"}>
        {children}
      </AdminShell>
    </DateSettingsProvider>
  );
}
