// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { LAYOUT_NAMES, optionValues } from "@sitebuilder/schema";
import type { TemplateBlock, TemplateOptionValues } from "@sitebuilder/template-sdk";
import { templates } from "../generated/site";
import type { TemplateLayouts } from "./types";

// The installed templates' code, for the site zone only: the admin never imports template code
// (it reads ./admin).

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

  const layout = <Name extends keyof TemplateLayouts>(name: Name): TemplateLayouts[Name] => {
    const component = template.layouts[name] ?? fallback.layouts[name];
    if (!component) throw new Error(`The default template has no ${name} layout`);
    return component;
  };

  const stylesheets = [
    ...(fromDefault && template !== fallback && fallback.stylesheet ? [fallback.stylesheet] : []),
    ...(template.stylesheet ? [template.stylesheet] : []),
  ];
  return {
    slug: templates[slug] ? slug : "default",
    layouts: {
      site: layout("site"),
      page: layout("page"),
      post: layout("post"),
      archive: layout("archive"),
      notFound: layout("notFound"),
    },
    stylesheets,
    options: optionValues(template.options, savedOptions),
    blocks: template.blocks,
  };
}
