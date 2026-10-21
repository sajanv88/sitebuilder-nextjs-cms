import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return <EditorScreen type="post" id={null} created={false} />;
}
