import { UsersIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  await requirePermission("user.read");
  return (
    <AdminPage title="Users">
      <AdminEmpty icon={<UsersIcon size={24} />} title="Only you so far">
        People you invite to edit the site will be listed here.
      </AdminEmpty>
    </AdminPage>
  );
}
