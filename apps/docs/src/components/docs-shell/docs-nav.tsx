// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefOf, SECTIONS } from "@/docs/nav";

// Every section with its pages, the open one marked.
export function DocsNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  // On a phone the sidebar is a panel over the page: following a link closes it.
  const close = () => setOpenMobile(false);

  return SECTIONS.map((section) => (
    <SidebarGroup key={section.title}>
      <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
      <SidebarMenu>
        {section.pages.map((page) => {
          const href = hrefOf(page.slug);
          return (
            <SidebarMenuItem key={page.slug}>
              <SidebarMenuButton asChild active={pathname === href}>
                <Link href={href as Route} onClick={close}>
                  <span>{page.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  ));
}
