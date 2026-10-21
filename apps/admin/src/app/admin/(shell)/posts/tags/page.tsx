import type { Metadata } from "next";
import { TermScreen } from "@/components/term-screen/term-screen";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  return <TermScreen taxonomy="tag" />;
}
