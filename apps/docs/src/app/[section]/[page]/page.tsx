// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page/docs-page";
import { placePage } from "@/docs/nav";
import { PAGES } from "@/docs/pages";

// Every page's address is /<section>/<page>. An address that isn't one never gets here:
// src/proxy.ts sends it to one no route matches, so it's a real 404 and not a streamed one.

// Rendered per request like every page here (the CSP nonce, app/layout.tsx); the address is
// read straight away, with nothing to stream around it.
export const instant = false;

async function slugOf(params: PageProps<"/[section]/[page]">["params"]): Promise<string> {
  const { section, page } = await params;
  return `${section}/${page}`;
}

export async function generateMetadata({
  params,
}: PageProps<"/[section]/[page]">): Promise<Metadata> {
  const placed = placePage(await slugOf(params));
  return placed ? { title: placed.page.title, description: placed.page.description } : {};
}

export default async function Page({ params }: PageProps<"/[section]/[page]">) {
  const slug = await slugOf(params);
  const placed = placePage(slug);
  const load = PAGES[slug];
  // Only when the page list and this file disagree; nav.test.ts checks they don't.
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
