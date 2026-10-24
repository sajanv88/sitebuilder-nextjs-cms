// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  BookOpenIcon,
  ChevronRightIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListIcon,
  PaletteIcon,
  SettingsIcon,
  UsersIcon,
} from "@nuvui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import "./admin-nav.scss";

// The sidebar's navigation, after nuvui's sidebar-nested block: labelled groups, and sections
// that open to show their pages, with the open page marked and its section open. Which links
// show is decided on the server (the shell layout passes the keys the viewer may use); hiding
// one is never the check (each page checks again).

export const NAV_KEYS = [
  "dashboard",
  "pages",
  "posts",
  "media",
  "menus",
  "appearance",
  "templates",
  "users",
  "settings",
  // Not a row of its own: Categories and Tags, under Posts.
  "terms",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

interface Page {
  label: string;
  href: Route;
  // Shown only with this key, on top of the section's own.
  needs?: NavKey;
}

interface Item {
  key: Exclude<NavKey, "terms">;
  label: string;
  href: Route;
  Icon: ComponentType<{ "aria-hidden"?: boolean | "true" }>;
  // A section: it opens to these pages instead of being a link itself.
  pages?: Page[];
}

const GROUPS: { label: string | null; items: Item[] }[] = [
  {
    label: null,
    items: [{ key: "dashboard", label: "Dashboard", href: "/admin", Icon: LayoutDashboardIcon }],
  },
  {
    label: "Content",
    items: [
      { key: "pages", label: "Pages", href: "/admin/pages", Icon: FileTextIcon },
      {
        key: "posts",
        label: "Posts",
        href: "/admin/posts",
        Icon: BookOpenIcon,
        pages: [
          { label: "All posts", href: "/admin/posts" },
          { label: "Categories", href: "/admin/posts/categories", needs: "terms" },
          { label: "Tags", href: "/admin/posts/tags", needs: "terms" },
        ],
      },
      { key: "media", label: "Media", href: "/admin/media", Icon: ImageIcon },
    ],
  },
  {
    label: "Site",
    items: [
      { key: "menus", label: "Menus", href: "/admin/menus", Icon: ListIcon },
      { key: "appearance", label: "Appearance", href: "/admin/appearance", Icon: PaletteIcon },
      { key: "templates", label: "Templates", href: "/admin/templates", Icon: LayersIcon },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "users", label: "Users", href: "/admin/users", Icon: UsersIcon },
      {
        key: "settings",
        label: "Settings",
        href: "/admin/settings",
        Icon: SettingsIcon,
        // One page; these are its tabs (the page marks the open one).
        pages: [
          { label: "Site", href: "/admin/settings?section=site" as Route },
          { label: "Reading", href: "/admin/settings?section=reading" as Route },
          { label: "Dates", href: "/admin/settings?section=dates" as Route },
          { label: "Media storage", href: "/admin/settings?section=media-storage" as Route },
          { label: "AI", href: "/admin/settings?section=ai" as Route },
        ],
      },
    ],
  },
];

// The page a path belongs to: the longest href that starts it, so /admin/posts/categories
// marks Categories and not All posts. A link to one of a page's tabs (?section=) never is.
function isOpen(pathname: string, href: string, all: readonly string[]): boolean {
  const path = href.split("?")[0] ?? href;
  if (href.includes("?")) return false;
  if (path === "/admin") return pathname === "/admin";
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  return !all.some((other) => other.length > path.length && pathname.startsWith(other));
}

export function AdminNav({ allowed }: { allowed: readonly NavKey[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  // On a phone the sidebar is a panel over the page: following a link closes it.
  const close = () => setOpenMobile(false);
  const hrefs = GROUPS.flatMap((group) =>
    group.items.flatMap((item) => [item.href, ...(item.pages ?? []).map((page) => page.href)]),
  ).filter((href) => !href.includes("?"));

  return GROUPS.map((group) => {
    const items = group.items.filter((item) => allowed.includes(item.key));
    if (items.length === 0) return null;
    return (
      <SidebarGroup key={group.label ?? "top"}>
        {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
        <SidebarMenu>
          {items.map(({ key, label, href, Icon, pages }) => {
            if (!pages) {
              const active = isOpen(pathname, href, hrefs);
              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton asChild active={active}>
                    <Link href={href} aria-current={active ? "page" : undefined} onClick={close}>
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }
            const shown = pages.filter((page) => !page.needs || allowed.includes(page.needs));
            const inside = pathname === href || pathname.startsWith(`${href}/`);
            return (
              // The section with the open page in it starts open.
              <Collapsible key={key} asChild defaultOpen={inside}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton className="admin-nav__section">
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                      <ChevronRightIcon aria-hidden="true" className="admin-nav__arrow" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {shown.map((page) => {
                        const active = isOpen(pathname, page.href, hrefs);
                        return (
                          <SidebarMenuSubItem key={page.href}>
                            <SidebarMenuSubButton asChild active={active}>
                              <Link
                                href={page.href}
                                aria-current={active ? "page" : undefined}
                                onClick={close}
                              >
                                {page.label}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    );
  });
}
