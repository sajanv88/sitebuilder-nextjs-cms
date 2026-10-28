// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { BookOpenIcon } from "@nuvui/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMain,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DocsNav } from "./docs-nav";
import "./docs-shell.scss";

// The start page, typed as a route: TypeScript 7 sometimes rejects the literal "/" in a
// Link's href, depending on the order it checks files in (decisions #153).
const HOME: Route = "/";

// The frame of every page: the sidebar with every section and page, after nuvui's
// sidebar-nested block, and a bar with the button that folds it away. On a phone the sidebar
// is a panel the same button opens.
export function DocsShell({
  sidebarOpen,
  children,
}: {
  sidebarOpen: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={sidebarOpen} className="docs-shell">
      <Sidebar label="Documentation" collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href={HOME}>
                  <BookOpenIcon aria-hidden="true" />
                  <span className="docs-shell__brand">Sitebuilder docs</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <DocsNav />
        </SidebarContent>
      </Sidebar>
      <SidebarMain className="docs-shell__main">
        <header className="docs-shell__bar">
          <SidebarTrigger label="Show or hide the contents" />
          <span className="docs-shell__title">Sitebuilder documentation</span>
        </header>
        {children}
      </SidebarMain>
    </SidebarProvider>
  );
}
