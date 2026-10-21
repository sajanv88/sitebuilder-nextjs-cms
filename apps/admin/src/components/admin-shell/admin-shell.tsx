import { ExternalLinkIcon, HexagonIcon } from "@nuvui/icons";
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

// The admin frame, from nuvui's sidebar-nested and app-shell blocks: a sidebar of labelled
// groups whose sections open to their pages (a panel on a phone), a bar across the top with a
// way to the public site, and the page. Folding to icons would hide the pages inside each
// section, so the sidebar slides out of the way instead.
export async function AdminShell({
  viewer,
  nav,
  siteTitle,
  children,
}: {
  viewer: { name: string; email: string };
  nav: readonly NavKey[];
  siteTitle: string;
  children: ReactNode;
}) {
  // nuvui remembers the folded state in this cookie. Reading it here sends the page in that
  // state, instead of expanded and then folding once the script has run.
  const open = (await cookies()).get("nuv-sidebar")?.value !== "false";

  return (
    <SidebarProvider className="admin-shell" defaultOpen={open}>
      <Sidebar label="Admin" collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="/admin">
                  <HexagonIcon />
                  <span className="admin-shell__brand">Sitebuilder</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <AdminNav allowed={nav} />
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
          <span className="admin-shell__site">{siteTitle}</span>
          <Button asChild intent="secondary" size="sm" className="admin-shell__view">
            {/* The public site is the other zone: a plain link, in its own tab. */}
            <a href="/" target="_blank" rel="noopener">
              <ExternalLinkIcon aria-hidden="true" size={16} />
              View site
            </a>
          </Button>
        </header>
        <div className="admin-shell__page">{children}</div>
      </SidebarMain>
    </SidebarProvider>
  );
}
