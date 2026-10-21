// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ChevronUpIcon, LogOutIcon, UserIcon } from "@nuvui/icons";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenuButton,
} from "@nuvui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";
import "./account-menu.scss";

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

// The signed-in person at the foot of the sidebar, from nuvui's sidebar-icons block. Folded,
// the avatar stands where an item's icon would. The menu holds their email, their account
// and signing out.
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Through Better Auth's endpoint, which deletes the session row and the cookie.
  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/admin/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="account-menu" tooltip={name}>
          <Avatar size="sm" className="account-menu__avatar">
            {/* The name is beside it: the initials would only be read twice. */}
            <AvatarFallback aria-hidden="true">{initials(name)}</AvatarFallback>
          </Avatar>
          <span>{name}</span>
          <ChevronUpIcon className="account-menu__chevron" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/admin/account">
            <UserIcon />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={signOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
