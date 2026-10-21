import { SettingsIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.update");
  return (
    <AdminPage title="Settings">
      <AdminEmpty icon={<SettingsIcon size={24} />} title="Default settings">
        The site's title, language and reading settings will be changed here.
      </AdminEmpty>
    </AdminPage>
  );
}
