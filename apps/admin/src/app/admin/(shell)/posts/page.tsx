import type { Metadata } from "next";
import { EntryListScreen } from "@/components/entry-list-screen/entry-list-screen";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage({ searchParams }: PageProps<"/admin/posts">) {
  return <EntryListScreen type="post" searchParams={searchParams} />;
}
