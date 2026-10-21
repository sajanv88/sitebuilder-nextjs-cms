import type { Metadata } from "next";
import { TermScreen } from "@/components/term-screen/term-screen";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return <TermScreen taxonomy="category" />;
}
