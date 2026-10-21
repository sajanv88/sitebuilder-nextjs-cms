// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { db, listUsers } from "@sitebuilder/db";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { UserManager } from "@/components/user-manager/user-manager";

export const metadata: Metadata = { title: "Users" };

// Admins only (§6.2). Every change on the screen is checked again by its action.
export default async function UsersPage() {
  const viewer = await requirePermission("user.read");
  const users = await listUsers(db);
  return (
    <AdminPage
      title="Users"
      description="The people who can sign in, and what each may do: admins run the site, editors look after all content, authors write their own posts."
      facts={[
        { label: "Admins", value: users.filter((u) => u.role === "admin").length },
        { label: "Editors", value: users.filter((u) => u.role === "editor").length },
        { label: "Authors", value: users.filter((u) => u.role === "author").length },
      ]}
    >
      <UserManager users={users} viewerId={viewer.id} />
    </AdminPage>
  );
}
