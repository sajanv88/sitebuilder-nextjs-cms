import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

// One route for a new page (/admin/pages/new) and an existing one. A new draft's first autosave
// only changes the address (decisions #56); a refresh after that draws the same editor.
export async function generateMetadata({
  params,
}: PageProps<"/admin/pages/[id]">): Promise<Metadata> {
  return { title: (await params).id === "new" ? "New page" : "Edit page" };
}

export default async function PageEditorPage({
  params,
  searchParams,
}: PageProps<"/admin/pages/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EditorScreen type="page" id={id === "new" ? null : id} created={query.created === "1"} />;
}
