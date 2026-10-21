import { can, canSome } from "@/auth/can";
import { requireViewer, type Viewer } from "@/auth/session";
import type { NavKey } from "@/components/admin-nav/admin-nav";
import { AdminShell } from "@/components/admin-shell/admin-shell";

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
  };
  return (Object.keys(shows) as NavKey[]).filter((key) => shows[key]);
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireViewer();
  return (
    <AdminShell viewer={viewer} nav={navFor(viewer)}>
      {children}
    </AdminShell>
  );
}
