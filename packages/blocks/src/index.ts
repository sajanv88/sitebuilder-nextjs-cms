// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The block registry and the renderer (design §5.5, §8), used by both zones: the admin zone's
// editor and the site zone's pages. Server-only checks are in "@sitebuilder/blocks/server".

export {
  cloneBlock,
  collectEntryIds,
  collectMediaIds,
  createBlock,
  headingBlockId,
  newBlockId,
} from "./content";
export { FEATURE_ICON_NAMES, FEATURE_ICONS, type FeatureIconName } from "./icons";
export { allowedChildren, BLOCKS, blockRules, getBlockDefinition, LEAF_TYPES } from "./registry";
export { type BlockFrameProps, BlockList } from "./render";
export type {
  AnyBlockDefinition,
  BlockCategory,
  BlockDefinition,
  BlockRenderProps,
  Choice,
  Field,
  ImageProps,
  PostSummary,
  RenderContext,
  RenderMedia,
} from "./types";
