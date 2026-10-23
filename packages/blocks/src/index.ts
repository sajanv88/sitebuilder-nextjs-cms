// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The block registry and the renderer (design §5.5, §8), used by both zones: the admin zone's
// editor and the site zone's pages. Server-only checks are in "@sitebuilder/blocks/server".

export {
  CANVAS_PATH,
  type CanvasData,
  type CanvasKey,
  canvasMessage,
  type FromCanvas,
  isEditorKey,
  readFromCanvas,
  readToCanvas,
  type ToCanvas,
} from "./canvas";
export {
  cloneBlock,
  collectEntryIds,
  collectMediaIds,
  createBlock,
  headingBlockId,
  newBlockId,
} from "./content";
export { FEATURE_ICON_NAMES, FEATURE_ICONS, type FeatureIconName } from "./icons";
export { type PageWidth, pageItemClass } from "./page/page";
export {
  allBlocks,
  allowedChildren,
  BLOCKS,
  blockRules,
  getBlockDefinition,
  leafTypes,
  registerTemplateBlocks,
} from "./registry";
export { type BlockFrameProps, BlockList } from "./render";
export { templateBlockDefinition, templateBlockSchema } from "./template-block";
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
