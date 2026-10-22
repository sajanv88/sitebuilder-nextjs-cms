// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { PackageIcon } from "@nuvui/icons";
import {
  LinkTarget,
  type TemplateBlockDeclaration,
  type TemplateField,
  templateBlockType,
} from "@sitebuilder/schema";
import type { MediaInfo } from "@sitebuilder/template-sdk";
import * as v from "valibot";
import { FEATURE_ICONS, FeatureIcon, type FeatureIconName } from "./icons";
import { BlockPlaceholder } from "./placeholder/block-placeholder";
import { mediaId, optionalText, text } from "./shared";
import type { AnyBlockDefinition, Field, RenderMedia } from "./types";

// A template's own block (design A9, decisions #112). Its fields, defaults and label are data
// from template.json, so both zones build the same definition and check the same props; only
// its component is code, which the site zone hands over through the render context. Anywhere
// else (the admin, a template that isn't active) there's no component: the public site draws
// nothing and the editor a placeholder, and the block's data is kept.

function fieldSchema(field: TemplateField): v.GenericSchema {
  switch (field.kind) {
    case "text":
      return field.optional ? optionalText(field.max) : text(field.max);
    case "choice":
      return v.picklist(field.options.map((option) => option.value));
    case "toggle":
      return v.boolean();
    case "number":
      return v.pipe(v.number(), v.integer(), v.minValue(field.min), v.maxValue(field.max));
    case "link":
      return LinkTarget;
    case "action":
      return v.strictObject({ label: text(field.max), href: LinkTarget });
    case "media":
      return mediaId;
    case "alt":
      // Left out: the file's own alt text; empty: decorative (as the image block).
      return v.optional(v.pipe(v.string(), v.trim(), v.maxLength(field.max)));
    case "icon":
      return FeatureIcon;
  }
}

// The props' strict schema, from the declared fields. A field that's optional may be left out;
// one with a default takes it when a stored block predates the field.
export function templateBlockSchema(
  declaration: TemplateBlockDeclaration,
): v.GenericSchema<unknown, Record<string, unknown>> {
  const entries = declaration.fields.map((field): [string, v.GenericSchema] => {
    const schema = fieldSchema(field);
    const optional = "optional" in field && field.optional === true;
    // Alt text and optional text are optional schemas already.
    if (field.kind === "alt" || (field.kind === "text" && optional)) return [field.name, schema];
    if (optional) return [field.name, v.optional(schema)];
    // Text has to be written; anything else falls back to its default.
    const fallback = declaration.defaults[field.name];
    if (fallback !== undefined && field.kind !== "text") {
      return [field.name, v.optional(schema, fallback as never)];
    }
    return [field.name, schema];
  });
  return v.strictObject(Object.fromEntries(entries)) as v.GenericSchema<
    unknown,
    Record<string, unknown>
  >;
}

// The inspector's fields: the same shapes as the built-in blocks'.
const inspectorField = (field: TemplateField): Field => field as Field;

function mediaInfo(media: RenderMedia): MediaInfo {
  return {
    id: media.id,
    src: media.url,
    width: media.width,
    height: media.height,
    alt: media.alt ?? "",
    mimeType: media.mimeType,
  };
}

export function templateBlockDefinition(
  slug: string,
  templateName: string,
  declaration: TemplateBlockDeclaration,
): AnyBlockDefinition {
  const type = templateBlockType(slug, declaration.name);
  const icon = FEATURE_ICONS[declaration.icon as FeatureIconName] ?? PackageIcon;
  const summaryField = declaration.summaryField;
  return {
    type,
    label: declaration.label,
    description: declaration.description,
    category: declaration.category,
    icon,
    props: templateBlockSchema(declaration),
    defaults: () => structuredClone(declaration.defaults),
    fields: declaration.fields.map(inspectorField),
    summary: (props) => {
      const value = summaryField ? props[summaryField] : undefined;
      return typeof value === "string" && value ? value : declaration.label;
    },
    Render: ({ props, context }) => {
      const Component = context.templateBlock?.(type);
      if (!Component) {
        return context.editing ? (
          <BlockPlaceholder icon={icon}>
            {`${declaration.label}: drawn by the ${templateName} template, which isn't showing here`}
          </BlockPlaceholder>
        ) : null;
      }
      return (
        <Component
          props={props}
          media={(id) => {
            const media = context.media(id);
            return media ? mediaInfo(media) : undefined;
          }}
          href={(target) => context.href(target)}
          editing={context.editing}
        />
      );
    },
  };
}
