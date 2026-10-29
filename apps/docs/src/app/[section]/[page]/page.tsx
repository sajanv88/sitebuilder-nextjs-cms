// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page/docs-page";
import { placePage } from "@/docs/nav";
import { PAGES } from "@/docs/pages";

// Rendered per request like every page here (the CSP nonce, app/layout.tsx); the address is
// read straight away, with nothing to stream around it.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[...slug]">): Promise<Metadata> {
  const placed = placePage((await params).slug.join("/"));
  return placed ? { title: placed.page.title, description: placed.page.description } : {};
}

export default async function Page({ params }: PageProps<"/[...slug]">) {
  const slug = (await params).slug.join("/");
  const placed = placePage(slug);
  const load = PAGES[slug];
  if (!placed || !load) notFound();

  const { default: Content } = await load();
  return (
    <DocsPage
      section={placed.section.title}
      title={placed.page.title}
      description={placed.page.description}
      previous={placed.previous}
      next={placed.next}
    >
      <Content />
    </DocsPage>
  );
}
