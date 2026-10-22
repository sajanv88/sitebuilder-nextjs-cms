// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { StarterContent, TemplateManifest } from "@sitebuilder/schema";

// What `pnpm sitebuilder generate` writes for the admin zone (generated/admin.ts): data only,
// checked at build time. A screenshot is an image import, which the admin's bundler serves.

export interface TemplateImage {
  src: string;
  width: number;
  height: number;
}

export interface GeneratedTemplate {
  // "bundled" ships with Sitebuilder; "local" was added from a folder and isn't reviewed.
  source: "bundled" | "local";
  manifest: TemplateManifest;
  starter: StarterContent | null;
  screenshots: readonly { image: TemplateImage; label: string }[];
}
