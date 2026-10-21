import { ImageIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requireSomePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  await requireSomePermission("media.read");
  return (
    <AdminPage title="Media">
      <AdminEmpty icon={<ImageIcon size={24} />} title="No media yet">
        Images, videos and files you upload will be listed here.
      </AdminEmpty>
    </AdminPage>
  );
}
