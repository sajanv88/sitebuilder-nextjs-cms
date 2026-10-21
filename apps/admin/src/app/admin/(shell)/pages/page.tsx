import type { Metadata } from "next";
import { EntryListScreen } from "@/components/entry-list-screen/entry-list-screen";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage({ searchParams }: PageProps<"/admin/pages">) {
  return <EntryListScreen type="page" searchParams={searchParams} />;
}
