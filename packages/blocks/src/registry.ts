import type { BlockRule, BlockRules } from "@sitebuilder/schema";
import { button } from "./blocks/block-button/block-button";
import { callout } from "./blocks/block-callout/block-callout";
import { column } from "./blocks/block-column/block-column";
import { columns } from "./blocks/block-columns/block-columns";
import { faq } from "./blocks/block-faq/block-faq";
import { featureGrid } from "./blocks/block-feature-grid/block-feature-grid";
import { fileDownload } from "./blocks/block-file-download/block-file-download";
import { gallery } from "./blocks/block-gallery/block-gallery";
import { heading } from "./blocks/block-heading/block-heading";
import { hero } from "./blocks/block-hero/block-hero";
import { image } from "./blocks/block-image/block-image";
import { latestPosts } from "./blocks/block-latest-posts/block-latest-posts";
import { pricing } from "./blocks/block-pricing/block-pricing";
import { quote } from "./blocks/block-quote/block-quote";
import { reviews } from "./blocks/block-reviews/block-reviews";
import { richText } from "./blocks/block-rich-text/block-rich-text";
import { section } from "./blocks/block-section/block-section";
import { separator } from "./blocks/block-separator/block-separator";
import { spacer } from "./blocks/block-spacer/block-spacer";
import { table } from "./blocks/block-table/block-table";
import { video } from "./blocks/block-video/block-video";
import type { AnyBlockDefinition } from "./types";

// The first block set (design §5.5). Adding a block type is a folder in src/blocks/ and a line
// here (design §8); nothing else needs to know about it.
export const BLOCKS: readonly AnyBlockDefinition[] = [
  heading,
  richText,
  quote,
  button,
  callout,
  image,
  gallery,
  video,
  fileDownload,
  section,
  columns,
  column,
  spacer,
  separator,
  hero,
  featureGrid,
  pricing,
  faq,
  reviews,
  latestPosts,
  table,
];

const BY_TYPE = new Map(BLOCKS.map((definition) => [definition.type, definition]));

export function getBlockDefinition(type: string): AnyBlockDefinition | undefined {
  return BY_TYPE.get(type);
}

// Every block type that isn't a container: what a section or a column may hold (design §5.2).
export const LEAF_TYPES: readonly string[] = BLOCKS.filter(
  (definition) => !definition.container,
).map((definition) => definition.type);

// The rules validateBlockList checks content against.
export const blockRules: BlockRules = Object.fromEntries(
  BLOCKS.map((definition): [string, BlockRule] => {
    const spec = definition.container;
    if (!spec) return [definition.type, { props: definition.props }];
    return [
      definition.type,
      {
        props: definition.props,
        container: {
          allow: spec.allow === "leaves" ? [...LEAF_TYPES] : [...spec.allow],
          ...(spec.min !== undefined ? { min: spec.min } : {}),
          ...(spec.max !== undefined ? { max: spec.max } : {}),
        },
      },
    ];
  }),
);

// Which types may go where: at the top of the page, anything but a lone column; inside a
// container, what its rule allows.
export function allowedChildren(parentType: string | null): readonly string[] {
  if (parentType === null) return BLOCKS.filter((d) => d.type !== "column").map((d) => d.type);
  return blockRules[parentType]?.container?.allow ?? [];
}
