// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { EntryListScreen } from "@/components/entry-list-screen/entry-list-screen";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage({ searchParams }: PageProps<"/admin/pages">) {
  return <EntryListScreen type="page" searchParams={searchParams} />;
}
