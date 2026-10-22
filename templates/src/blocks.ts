// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { type AnyBlockDefinition, templateBlockDefinition } from "@sitebuilder/blocks";
import { templateBlocks } from "../generated/blocks";

// The installed templates' blocks as block definitions, for registerTemplateBlocks in each zone
// (decisions #112): their fields, defaults and labels, from data. No template code is reachable
// from here, so the admin may import it, in the browser too. Drawing one needs the template's
// component, which only the site zone loads.
export function installedTemplateBlocks(): AnyBlockDefinition[] {
  return templateBlocks.flatMap((template) =>
    template.blocks.map((block) => templateBlockDefinition(template.slug, template.name, block)),
  );
}
