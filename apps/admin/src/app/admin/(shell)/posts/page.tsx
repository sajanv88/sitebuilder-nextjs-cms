import { BookOpenIcon } from "@nuvui/icons";
import type { Metadata } from "next";
import { requireSomePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsPage() {
  await requireSomePermission("post.read");
  return (
    <AdminPage title="Posts">
      <AdminEmpty icon={<BookOpenIcon size={24} />} title="No posts yet">
        Posts you write will be listed here.
      </AdminEmpty>
    </AdminPage>
  );
}
