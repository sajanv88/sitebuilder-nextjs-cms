"use client";

import { LogOutIcon } from "@nuvui/icons";
import { SidebarMenuButton } from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/auth-client";

// Signs out through Better Auth's endpoint, which deletes the session row and the cookie.
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/admin/sign-in");
    router.refresh();
  }

  return (
    <SidebarMenuButton onClick={signOut} disabled={pending} tooltip="Sign out">
      <LogOutIcon size={18} />
      <span>Sign out</span>
    </SidebarMenuButton>
  );
}
