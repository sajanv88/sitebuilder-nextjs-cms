// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { templates } from "../generated/admin";
import type { GeneratedTemplate } from "./types";

// The installed templates, for the admin zone: manifests, starter content and screenshots. No
// template code is reachable from here (docs/templates_and_ai_design.md R1, R3).

export type { GeneratedTemplate, TemplateImage } from "./types";

// "default" first, then by name.
export function listTemplates(): readonly GeneratedTemplate[] {
  return [...templates].sort((a, b) =>
    a.manifest.slug === "default"
      ? -1
      : b.manifest.slug === "default"
        ? 1
        : a.manifest.name.localeCompare(b.manifest.name),
  );
}

export function findTemplate(slug: string): GeneratedTemplate | undefined {
  return templates.find((template) => template.manifest.slug === slug);
}
