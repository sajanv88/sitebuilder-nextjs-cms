import { PaletteIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requirePermission("theme.update");
  return (
    <AdminPage title="Appearance">
      <AdminEmpty icon={<PaletteIcon size={24} />} title="The default theme is in use">
        The site's theme, colors and density will be chosen here.
      </AdminEmpty>
    </AdminPage>
  );
}
