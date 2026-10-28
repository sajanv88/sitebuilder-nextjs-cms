// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { DocsPage } from "@/components/docs-page/docs-page";
import { ALL_PAGES } from "@/docs/nav";
import { HOME } from "@/docs/pages";

export default async function HomePage() {
  const { default: Content } = await HOME();
  return (
    <DocsPage
      section={null}
      title="Sitebuilder documentation"
      description="How to build a website with Sitebuilder and keep it running, one feature at a time."
      previous={null}
      next={ALL_PAGES[0] ?? null}
    >
      <Content />
    </DocsPage>
  );
}
