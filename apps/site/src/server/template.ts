// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type LoadedTemplate, loadTemplate } from "@sitebuilder/templates/site";
import { cache } from "react";
import { getTemplateSettings } from "./content";
import "./template-blocks";

// The template the public site is drawn with, chosen on the admin's Templates screen: its
// layouts, stylesheets, option values and blocks. Once per request.
export const activeTemplate = cache(async (): Promise<LoadedTemplate> => {
  const settings = await getTemplateSettings();
  return loadTemplate(settings.slug, settings.options);
});
