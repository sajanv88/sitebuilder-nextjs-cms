import { ListIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage() {
  await requirePermission("menu.update");
  return (
    <AdminPage title="Menus">
      <AdminEmpty icon={<ListIcon size={24} />} title="No menu items yet">
        The site's primary and footer menus will be edited here.
      </AdminEmpty>
    </AdminPage>
  );
}
