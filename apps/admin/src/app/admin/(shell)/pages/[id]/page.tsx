import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditPagePage({
  params,
  searchParams,
}: PageProps<"/admin/pages/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EditorScreen type="page" id={id} created={query.created === "1"} />;
}
