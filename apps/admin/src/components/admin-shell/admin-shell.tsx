import { HexagonIcon } from "@nuvui/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMain,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@nuvui/react";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu/account-menu";
import { AdminNav, type NavKey } from "@/components/admin-nav/admin-nav";
import "./admin-shell.scss";

// The admin frame, from nuvui's sidebar-icons and app-shell blocks: a sidebar that folds to a
// strip of icons (a panel on a phone), a bar across the top, and the page. Everything in the
// sidebar is a menu row with an icon first, so each row folds down to its icon.
export async function AdminShell({
  viewer,
  nav,
  children,
}: {
  viewer: { name: string; email: string };
  nav: readonly NavKey[];
  children: ReactNode;
}) {
  // nuvui remembers the folded state in this cookie. Reading it here sends the page in that
  // state, instead of expanded and then folding once the script has run.
  const open = (await cookies()).get("nuv-sidebar")?.value !== "false";

  return (
    <SidebarProvider className="admin-shell" defaultOpen={open}>
      <Sidebar label="Admin">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="View the site">
                {/* The public site is the other zone: a plain link, a full page load. */}
                <a href="/">
                  <HexagonIcon />
                  <span className="admin-shell__brand">Sitebuilder</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <AdminNav allowed={nav} />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu name={viewer.name} email={viewer.email} />
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
