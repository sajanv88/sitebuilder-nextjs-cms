// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { SiteLayoutProps } from "@sitebuilder/template-sdk";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// The frame of every page: the header, the page, and the footer at the bottom of the window
// even when the page is short. The fonts option picks a pair of font stacks (styles/_site.scss);
// the header's options go to the header.
export default function Site({ site, menus, currentPath, options, children }: SiteLayoutProps) {
  const fonts = options.fonts;
  return (
    <div className={fonts && fonts !== "theme" ? `site site--fonts-${fonts}` : "site"}>
      <SiteHeader
        title={site.title}
        items={menus.primary}
        currentPath={currentPath}
        behaviour={
          options.header === "hides" || options.header === "scrolls" ? options.header : "sticky"
        }
        menuPosition={
          options.menuPosition === "center" || options.menuPosition === "end"
            ? options.menuPosition
            : "start"
        }
        menuButton={options.menuButton === true}
      />
      <main id="content" className="site__main">
        {children}
      </main>
      <SiteFooter title={site.title} tagline={site.tagline} items={menus.footer} />
    </div>
  );
}
