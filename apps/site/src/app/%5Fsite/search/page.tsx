// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { SiteSearch } from "@/components/site-search/site-search";
import { searchSite } from "@/server/content";

// /search (decisions #144): the proxy sends it here while search is on in Settings → Reading and
// no page holds the address. Results aren't for search engines to index.

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

// One value per key, as typed; anything else is no search.
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function SearchPage({ searchParams }: PageProps<"/_site/search">) {
  const query = await searchParams;
  const text = one(query.q).trim().slice(0, 200);
  const pageText = one(query.page);
  const page = /^[1-9]\d{0,3}$/.test(pageText) ? Number(pageText) : 1;
  const found = text ? await searchSite(text, page) : { rows: [], total: 0, perPage: 10 };
  return <SiteSearch text={text} page={page} {...found} />;
}
