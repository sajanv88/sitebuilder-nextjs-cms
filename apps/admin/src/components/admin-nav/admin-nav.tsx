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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@nuvui/react";
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
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

const items: Record<
  NavKey,
  { label: string; href: Route; Icon: ComponentType<{ size?: number }> }
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
// keys the viewer may use); this only marks the open page.
export function AdminNav({ allowed }: { allowed: readonly NavKey[] }) {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {allowed.map((key) => {
        const { label, href, Icon } = items[key];
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <SidebarMenuItem key={key}>
            <SidebarMenuButton asChild active={active} tooltip={label}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
