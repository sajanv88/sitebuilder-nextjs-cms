// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { connection } from "next/server";
import { SiteFrame } from "@/components/site-frame/site-frame";
import { getSite } from "@/server/content";
import { siteInfo } from "@/server/layout-props";
import { activeTemplate } from "@/server/template";

// Unknown and unpublished paths, answered with a 404 (src/proxy.ts), and pages that call
// notFound(): the template's NotFound layout in its frame, so the menus are there to carry on
// from. It sits outside the /_site layout, so it draws the frame itself. Request time only, like
// every page: the build would otherwise prerender it, and the build has no database.
export default async function NotFound() {
  await connection();
  const [site, template] = await Promise.all([getSite(), activeTemplate()]);
  const Layout = template.layouts.notFound;
  return (
    <SiteFrame>
      <Layout site={siteInfo(site)} options={template.options} />
    </SiteFrame>
  );
}
