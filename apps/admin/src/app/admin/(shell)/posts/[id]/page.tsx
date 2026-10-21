import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

// One route for a new post (/admin/posts/new) and an existing one. A new draft's first autosave
// only changes the address (decisions #56); a refresh after that draws the same editor.
export async function generateMetadata({
  params,
}: PageProps<"/admin/posts/[id]">): Promise<Metadata> {
  return { title: (await params).id === "new" ? "New post" : "Edit post" };
}

export default async function PostEditorPage({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EditorScreen type="post" id={id === "new" ? null : id} created={query.created === "1"} />;
}
