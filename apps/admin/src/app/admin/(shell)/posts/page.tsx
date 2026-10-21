// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { EntryListScreen } from "@/components/entry-list-screen/entry-list-screen";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage({ searchParams }: PageProps<"/admin/posts">) {
  return <EntryListScreen type="post" searchParams={searchParams} />;
}
