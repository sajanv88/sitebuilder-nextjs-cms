import { FileTextIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requireSomePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage() {
  await requireSomePermission("page.read");
  return (
    <AdminPage title="Pages">
      <AdminEmpty icon={<FileTextIcon size={24} />} title="No pages yet">
        Pages you create will be listed here.
      </AdminEmpty>
    </AdminPage>
  );
}
