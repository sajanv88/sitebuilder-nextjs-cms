import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMain,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@nuvui/react";
import type { ReactNode } from "react";
import { AdminNav, type NavKey } from "@/components/admin-nav/admin-nav";
import { SignOutButton } from "@/components/sign-out-button/sign-out-button";
import "./admin-shell.scss";

// The admin frame, from nuvui's app-shell block: a sidebar that folds to its icons, a bar
// across the top and the page. The block's activity panel isn't needed.
export function AdminShell({
  viewer,
  nav,
  children,
}: {
  viewer: { name: string; email: string };
  nav: readonly NavKey[];
  children: ReactNode;
}) {
  return (
    <SidebarProvider className="admin-shell">
      <Sidebar label="Admin">
        <SidebarHeader>
          {/* The public site is the other zone: a plain link, a full page load. */}
          <a className="admin-shell__brand" href="/">
            Sitebuilder
          </a>
        </SidebarHeader>
        <SidebarContent>
          <AdminNav allowed={nav} />
        </SidebarContent>
        <SidebarFooter>
          <p className="admin-shell__viewer">
            <span className="admin-shell__name">{viewer.name}</span>
            <span className="admin-shell__email">{viewer.email}</span>
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SignOutButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarMain className="admin-shell__main">
        <header className="admin-shell__bar">
          <SidebarTrigger />
        </header>
        <div className="admin-shell__page">{children}</div>
      </SidebarMain>
    </SidebarProvider>
  );
}
