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
    <AdminPage title="Users">
      <UserManager users={users} viewerId={viewer.id} />
    </AdminPage>
  );
}
