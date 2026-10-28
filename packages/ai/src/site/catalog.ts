// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { cleanText } from "./fence";

// What the model knows of the block types (templates_and_ai_design B6): a short line per block
// for choosing them, and a JSON Schema for writing them, built from each block's own fields.
//
// The schema meets what Anthropic's and OpenAI's structured output accept: every object closed
// (additionalProperties false) with every property required, optional ones nullable (the
// answer's nulls are taken out before validation), and no recursion: a page is leaf blocks,
// sections of leaf blocks, and columns of columns of leaf blocks, which is all the containers
// allow (packages/blocks: section and column hold leaves, columns holds two to four columns).
// Length limits and ranges aren't in the schema (neither provider accepts them there): they're
// in each field's description, and the validator checks them after.

// The fields of a block as packages/blocks describes them (its Field type), as far as the model
// needs them. A block definition's fields fit this shape as they are.
interface FieldBase {
  name: string;
  label: string;
  description?: string;
}
export type FieldSpec =
  | (FieldBase & { kind: "text"; max: number; optional?: boolean; multiline?: boolean })
  | (FieldBase & { kind: "richtext" })
  | (FieldBase & {
      kind: "choice";
      options: readonly { value: string; label: string }[];
      numeric?: boolean;
    })
  | (FieldBase & { kind: "toggle" })
  | (FieldBase & { kind: "number"; min: number; max: number })
  | (FieldBase & { kind: "link"; optional?: boolean })
  | (FieldBase & { kind: "action"; optional?: boolean; max: number })
  | (FieldBase & { kind: "media"; accept: string; optional?: boolean })
  | (FieldBase & { kind: "media-list"; accept: string; max: number })
  | (FieldBase & { kind: "alt"; max: number })
  | (FieldBase & { kind: "icon" })
  | (FieldBase & {
      kind: "strings";
      itemLabel: string;
      min: number;
      max: number;
      maxLength: number;
    })
  | (FieldBase & { kind: "terms" })
  | (FieldBase & {
      kind: "list";
      itemLabel: string;
      min: number;
      max: number;
      fields: readonly FieldSpec[];
    })
  | (FieldBase & { kind: "align"; inherit: boolean })
  | (FieldBase & { kind: "rows"; columnsFrom: string; max: number; maxLength: number })
  | (FieldBase & { kind: "background"; noneLabel?: string })
  | (FieldBase & { kind: "widths" });

export interface BlockSpec {
  type: string;
  label: string;
  description: string;
  container?: { allow: "leaves" | readonly string[]; min?: number; max?: number } | undefined;
  fields: readonly FieldSpec[];
}

// A file in the media library the page may use, by id.
export interface MediaChoice {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  filename: string;
  alt: string | null;
}

export interface CatalogOptions {
  media: readonly MediaChoice[];
  // The refs of the planned pages, for links between them.
  refs: readonly string[];
  // The icon names a feature can have (packages/blocks FEATURE_ICON_NAMES).
  icons: readonly string[];
}

type Schema = Record<string, unknown>;

// packages/blocks align/align.ts.
const ALIGNS = ["start", "center", "end"];

const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });

// A label and description from a block definition, cleaned: a template author writes them.
const describe = (field: FieldBase, extra?: string): string =>
  [cleanText(field.label, 80), field.description ? cleanText(field.description, 240) : "", extra]
    .filter(Boolean)
    .join(". ");

function closed(properties: Record<string, Schema>, description?: string): Schema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// Where a link goes, defined once in the schema's $defs and referred to from every link and
// button: written out in each, it made the grammar Anthropic compiles too large (spike S4).
const LINK: Schema = { $ref: "#/$defs/link" };

function linkDefinition(options: CatalogOptions): Schema {
  const url = closed({
    kind: { const: "url" },
    url: {
      type: "string",
      description:
        "An https:// address the owner gave, a mailto: or tel: address the owner gave, or a path on this site starting with /",
    },
  });
  if (options.refs.length === 0) return url;
  const entry = closed({
    kind: { const: "entry" },
    entryId: {
      enum: options.refs.map((ref) => `ref:${ref}`),
      description: "Another page of this site, by its ref in the plan",
    },
  });
  return { anyOf: [entry, url] };
}

function mediaIds(accept: string, options: CatalogOptions): string[] {
  return options.media.filter((m) => accept === "any" || m.kind === accept).map((m) => m.id);
}

// The schema of one field's value, or null for a field the model doesn't fill.
function fieldSchema(field: FieldSpec, options: CatalogOptions): Schema | null {
  switch (field.kind) {
    case "text": {
      const schema = {
        type: "string",
        description: describe(field, `At most ${field.max} characters`),
      };
      return field.optional ? nullable(schema) : schema;
    }
    case "richtext":
      return {
        type: "string",
        description: describe(
          field,
          "HTML: only <p>, <h2>, <h3>, <h4>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote> and <a href>",
        ),
      };
    case "choice":
      return {
        enum: field.options.map((o) => (field.numeric ? Number(o.value) : o.value)),
        description: describe(
          field,
          field.options.map((o) => `${o.value}: ${cleanText(o.label, 40)}`).join("; "),
        ),
      };
    case "toggle":
      return { type: "boolean", description: describe(field) };
    case "number":
      return { type: "number", description: describe(field, `From ${field.min} to ${field.max}`) };
    case "link":
      return field.optional ? nullable(LINK) : LINK;
    case "action": {
      const schema = closed(
        {
          label: {
            type: "string",
            description: `The button's words. At most ${field.max} characters`,
          },
          href: LINK,
        },
        describe(field),
      );
      return field.optional ? nullable(schema) : schema;
    }
    case "media": {
      const ids = mediaIds(field.accept, options);
      if (ids.length === 0) return field.optional ? { type: "null" } : null;
      const schema = {
        enum: ids,
        description: describe(field, "A file from the media list, by id"),
      };
      return field.optional ? nullable(schema) : schema;
    }
    case "media-list": {
      const ids = mediaIds(field.accept, options);
      if (ids.length === 0) return null;
      return {
        type: "array",
        items: { enum: ids },
        description: describe(field, `Files from the media list, by id. At most ${field.max}`),
      };
    }
    case "alt":
      return nullable({
        type: "string",
        description: describe(
          field,
          `What the picture shows, for people who can't see it. At most ${field.max} characters`,
        ),
      });
    case "icon":
      return { enum: [...options.icons], description: describe(field) };
    case "strings":
      return {
        type: "array",
        items: { type: "string" },
        description: describe(
          field,
          `${field.min} to ${field.max} items, each at most ${field.maxLength} characters`,
        ),
      };
    case "terms":
      // Categories and tags are the site's own; the model doesn't choose them.
      return null;
    case "list": {
      const item = propsSchema(field.fields, options);
      if (!item) return null;
      return {
        type: "array",
        items: item,
        description: describe(field, `${field.min} to ${field.max} items`),
      };
    }
    case "align": {
      const schema = { enum: ALIGNS, description: describe(field) };
      return field.inherit ? nullable(schema) : schema;
    }
    case "background":
      // A card's colour is the owner's choice; offering it would grow the schema for little.
      return null;
    case "widths":
      // Columns start equal; the owner drags them wider or narrower.
      return null;
    case "rows":
      return {
        type: "array",
        items: { type: "array", items: { type: "string" } },
        description: describe(
          field,
          `At most ${field.max} rows; one cell per column, each at most ${field.maxLength} characters`,
        ),
      };
  }
}

// A block's props, or null when a required field can't be filled (a picture with no pictures
// in the library): the block is then left out of the schema.
function propsSchema(fields: readonly FieldSpec[], options: CatalogOptions): Schema | null {
  const properties: Record<string, Schema> = {};
  for (const field of fields) {
    const schema = fieldSchema(field, options);
    if (schema === null) {
      // Optional props the model leaves to the owner.
      if (field.kind === "terms" || field.kind === "background") continue;
      return null;
    }
    properties[field.name] = schema;
  }
  return closed(properties);
}

function variant(block: BlockSpec, props: Schema, children?: Schema): Schema {
  return closed(
    {
      type: { const: block.type },
      props,
      ...(children ? { children } : {}),
    },
    cleanText(block.description, 240),
  );
}

export interface PageCatalog {
  // The block types the schema offers.
  types: string[];
  // Each block once, by name ("block_<type>"), referred to from the list: a leaf block appears
  // at the top, in sections and in columns, and would otherwise be written out three times.
  defs: Record<string, Schema>;
  // A block list: leaf blocks, sections and columns.
  list: Schema;
}

const defName = (type: string) => `block_${type.replace(/[^a-z0-9]/gi, "_")}`;
const ref = (type: string): Schema => ({ $ref: `#/$defs/${defName(type)}` });

// `only`: the block types to offer (a page's planned sections, decisions #133); all, without it.
// Sections and columns come with the leaf types offered.
export function pageCatalog(
  blocks: readonly BlockSpec[],
  options: CatalogOptions,
  only?: readonly string[],
): PageCatalog {
  const offered = (type: string) => !only || only.includes(type);
  const defs: Record<string, Schema> = {};
  const leafTypes: string[] = [];
  for (const block of blocks) {
    if (block.container || !offered(block.type)) continue;
    const props = propsSchema(block.fields, options);
    if (!props) continue;
    defs[defName(block.type)] = variant(block, props);
    leafTypes.push(block.type);
  }
  const leafList = { type: "array", items: { anyOf: leafTypes.map(ref) } };
  const types = [...leafTypes];

  const section = offered("section") ? blocks.find((b) => b.type === "section") : undefined;
  const sectionProps = section && propsSchema(section.fields, options);
  if (section && sectionProps) {
    defs[defName("section")] = variant(section, sectionProps, leafList);
    types.push("section");
  }
  const columns = offered("columns") ? blocks.find((b) => b.type === "columns") : undefined;
  const column = blocks.find((b) => b.type === "column");
  const columnsProps = columns && propsSchema(columns.fields, options);
  const columnProps = column && propsSchema(column.fields, options);
  if (columns && column && columnsProps && columnProps) {
    defs[defName("column")] = variant(column, columnProps, leafList);
    defs[defName("columns")] = variant(columns, columnsProps, {
      type: "array",
      items: ref("column"),
      description: "Two to four columns",
    });
    types.push("columns");
  }
  defs.link = linkDefinition(options);
  return { types, defs, list: { type: "array", items: { anyOf: types.map(ref) } } };
}

// One line per block type, for choosing blocks when planning and writing: the type, what it's
// for, and whether it needs pictures. Built-in blocks only: a template's blocks are data, put
// in a fenced block by the prompt.
export function catalogLines(blocks: readonly BlockSpec[], available: readonly string[]): string {
  return blocks
    .filter((block) => available.includes(block.type))
    .map((block) => `- ${block.type}: ${cleanText(block.description, 240)}`)
    .join("\n");
}

// A block list as the model wrote it, without any ids it wrote (B6: the server gives every block
// a fresh one; the schema has no id, but a model that isn't held to it may still send one).
export function withoutIds(blocks: unknown): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const { id: _id, children, ...rest } = block as Record<string, unknown>;
    return children === undefined ? rest : { ...rest, children: withoutIds(children) };
  });
}

// The answer's nulls taken out, so an optional field the model left empty is absent, as the
// block's props schema expects.
export function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== null) out[key] = withoutNulls(item);
  }
  return out;
}
