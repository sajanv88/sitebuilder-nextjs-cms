import type { Metadata } from "next";
import { EditorScreen } from "@/components/editor-screen/editor-screen";

export const metadata: Metadata = { title: "New page" };

export default function NewPagePage() {
  return <EditorScreen type="page" id={null} created={false} />;
}
