// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { db, getTemplateSettings } from "@sitebuilder/db";
import { optionValues } from "@sitebuilder/schema";
import { findTemplate, listTemplates } from "@sitebuilder/templates/admin";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import {
  TemplateGallery,
  type TemplateSummary,
} from "@/components/template-gallery/template-gallery";
import { TemplateOptions } from "@/components/template-options/template-options";
import "./templates.scss";

export const metadata: Metadata = { title: "Templates" };

const DESCRIPTION =
  "Start the site from a ready-made design: its look, starter pages to edit, and its menus. Nothing you've written is changed or removed.";

// The installed templates (design §14). Only admins choose one (template.activate, §6).
export default async function TemplatesPage() {
  await requirePermission("template.activate");
  const active = await getTemplateSettings(db);
  // What the cards show; the starter content itself stays on the server.
  const templates: TemplateSummary[] = listTemplates().map(
    ({ manifest, starter, source, screenshots }) => ({
      slug: manifest.slug,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      reviewed: source === "bundled",
      pages: starter?.pages.length ?? 0,
      posts: starter?.posts.length ?? 0,
      screenshots,
    }),
  );
  // The one in use, when it has options: they're set here, above the others.
  const current = findTemplate(active.slug)?.manifest;
  const options = current?.options ?? [];
  return (
    <AdminPage title="Templates" description={DESCRIPTION} width="wide">
      <div className="templates-screen">
        {current && options.length > 0 ? (
          <TemplateOptions
            slug={current.slug}
            name={current.name}
            options={options}
            initial={optionValues(options, active.options)}
          />
        ) : null}
        <TemplateGallery templates={templates} active={active.slug} />
      </div>
    </AdminPage>
  );
}
