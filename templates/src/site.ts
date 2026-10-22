// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { LAYOUT_NAMES, optionValues } from "@sitebuilder/schema";
import type { TemplateBlock, TemplateOptionValues } from "@sitebuilder/template-sdk";
import { templates } from "../generated/site";
import type { TemplateLayouts } from "./types";

// The installed templates' code, for the site zone only: the admin never imports template code
// (it reads ./admin). A template's layouts are loaded when it's drawn with.

export type { TemplateLayouts } from "./types";

export interface LoadedTemplate {
  slug: string;
  layouts: TemplateLayouts;
  // In order: the default template's when any of its layouts are used, then the template's own.
  stylesheets: readonly string[];
  options: TemplateOptionValues;
  // Its blocks' components, by block type (<slug>:<name>).
  blocks: Readonly<Record<string, TemplateBlock<Record<string, unknown>>>>;
}

// A template that isn't installed (any more) is drawn as the default one; a layout it doesn't
// have, with the default template's.
export async function loadTemplate(
  slug: string,
  savedOptions: Readonly<Record<string, unknown>> = {},
): Promise<LoadedTemplate> {
  const fallback = templates.default;
  if (!fallback) throw new Error("The default template isn't installed");
  const template = templates[slug] ?? fallback;
  const fromDefault = LAYOUT_NAMES.some((name) => !template.layouts[name]);

  const load = async <Name extends keyof TemplateLayouts>(
    name: Name,
  ): Promise<TemplateLayouts[Name]> => {
    const loader = template.layouts[name] ?? fallback.layouts[name];
    if (!loader) throw new Error(`The default template has no ${name} layout`);
    return loader();
  };
  const [site, page, post, archive, notFound, blocks] = await Promise.all([
    load("site"),
    load("page"),
    load("post"),
    load("archive"),
    load("notFound"),
    Promise.all(
      Object.entries(template.blocks).map(
        async ([type, loader]) => [type, await loader()] as const,
      ),
    ),
  ]);

  const stylesheets = [
    ...(fromDefault && template !== fallback && fallback.stylesheet ? [fallback.stylesheet] : []),
    ...(template.stylesheet ? [template.stylesheet] : []),
  ];
  return {
    slug: templates[slug] ? slug : "default",
    layouts: { site, page, post, archive, notFound },
    stylesheets,
    options: optionValues(template.options, savedOptions),
    blocks: Object.fromEntries(blocks),
  };
}
