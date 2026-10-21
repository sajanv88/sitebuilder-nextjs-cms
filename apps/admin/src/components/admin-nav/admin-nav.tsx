"use client";

import {
  BookOpenIcon,
  FileTextIcon,
  ImageIcon,
  LayoutDashboardIcon,
  ListIcon,
  PaletteIcon,
  SettingsIcon,
  UsersIcon,
} from "@nuvui/icons";
import {
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

export const NAV_KEYS = [
  "dashboard",
  "pages",
  "posts",
  "media",
  "menus",
  "appearance",
  "users",
  "settings",
  // Not a row of its own: Categories and Tags, under Posts.
  "terms",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

const items: Record<
  Exclude<NavKey, "terms">,
  { label: string; href: Route; Icon: ComponentType }
> = {
  dashboard: { label: "Dashboard", href: "/admin", Icon: LayoutDashboardIcon },
  pages: { label: "Pages", href: "/admin/pages", Icon: FileTextIcon },
  posts: { label: "Posts", href: "/admin/posts", Icon: BookOpenIcon },
  media: { label: "Media", href: "/admin/media", Icon: ImageIcon },
  menus: { label: "Menus", href: "/admin/menus", Icon: ListIcon },
  appearance: { label: "Appearance", href: "/admin/appearance", Icon: PaletteIcon },
  users: { label: "Users", href: "/admin/users", Icon: UsersIcon },
  settings: { label: "Settings", href: "/admin/settings", Icon: SettingsIcon },
};

// The sidebar's links. Which ones show is decided on the server (the shell layout passes the
// keys the viewer may use); this only marks the open page, and closes the panel the sidebar
// becomes on a phone once a link is followed: client navigation doesn't leave the page.
const termLinks = [
  { label: "Categories", href: "/admin/posts/categories" },
  { label: "Tags", href: "/admin/posts/tags" },
] as const satisfies readonly { label: string; href: Route }[];

export function AdminNav({ allowed }: { allowed: readonly NavKey[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const onTerms = termLinks.some((link) => pathname.startsWith(link.href));

  return (
    <SidebarMenu>
      {allowed.map((key) => {
        if (key === "terms") return null;
        const { label, href, Icon } = items[key];
        // One item is the open page: on Categories or Tags it's the sub-item, not Posts.
        const active =
          href === "/admin" ? pathname === href : pathname.startsWith(href) && !onTerms;
        return (
          <SidebarMenuItem key={key}>
            <SidebarMenuButton asChild active={active} tooltip={label}>
              <Link href={href} aria-current={active ? "page" : undefined} onClick={close}>
                <Icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
            {key === "posts" && allowed.includes("terms") ? (
              <SidebarMenuSub>
                {termLinks.map((link) => (
                  <SidebarMenuSubItem key={link.href}>
                    <SidebarMenuSubButton asChild active={pathname.startsWith(link.href)}>
                      <Link href={link.href} onClick={close}>
                        {link.label}
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
