// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Badge } from "@nuvui/react";
import type { SiteLayoutProps } from "@sitebuilder/template-sdk";
import Link from "next/link";
import { Nav } from "./nav";

export default function Site({ site, menus, currentPath, options, children }: SiteLayoutProps) {
  return (
    <div className={options.stickyHeader ? "code-site code-site--sticky" : "code-site"}>
      <header className="code-site__header">
        <Link href="/">{site.title}</Link>
        <Nav items={menus.primary} currentPath={currentPath} />
        <Badge>{site.tagline}</Badge>
      </header>
      <main id="content">{children}</main>
      <footer>
        <a href="https://example.com" rel="noopener noreferrer">
          Example
        </a>
      </footer>
    </div>
  );
}
