import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EditorScreen type="post" id={id} created={query.created === "1"} />;
}
