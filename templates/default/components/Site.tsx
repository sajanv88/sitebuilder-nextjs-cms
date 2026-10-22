// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { SiteLayoutProps } from "@sitebuilder/template-sdk";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// The frame of every page: the header, the page, and the footer at the bottom of the window
// even when the page is short.
export default function Site({ site, menus, currentPath, children }: SiteLayoutProps) {
  return (
    <div className="site">
      <SiteHeader title={site.title} items={menus.primary} currentPath={currentPath} />
      <main id="content" className="site__main">
        {children}
      </main>
      <SiteFooter title={site.title} tagline={site.tagline} items={menus.footer} />
    </div>
  );
}
