// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getSite, getSiteMenu } from "@/server/content";
import { menuItems, siteInfo } from "@/server/layout-props";
import { activeTemplate } from "@/server/template";

// The active template's Site layout, its header, footer and frame, around a page, with the
// template's stylesheets. Drawn below the root layout (by the /_site layout, and by the
// not-found page, which sits outside it), so the root error page still shows when a template's
// layout throws (decisions #118).
export async function SiteFrame({ children }: { children: ReactNode }) {
  // The address the visitor asked for, before the proxy rewrote it (src/proxy.ts).
  const path = (await headers()).get("x-site-path") ?? "/";
  const [site, primary, footer, template] = await Promise.all([
    getSite(),
    getSiteMenu("primary"),
    getSiteMenu("footer"),
    activeTemplate(),
  ]);
  const Site = template.layouts.site;
  return (
    <>
      {/* After every stylesheet of the site's own (decisions #110). */}
      {template.stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="template" />
      ))}
      <Site
        site={siteInfo(site)}
        menus={{ primary: menuItems(primary), footer: menuItems(footer) }}
        currentPath={path}
        options={template.options}
      >
        {children}
      </Site>
    </>
  );
}
