// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";
import { NodeId } from "./shared";

// The structure of a block list (design §5.2). Props are checked per block type by
// validateBlockList, with the rules the block registry provides.

export const BlockType = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{1,39}$/));

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: Block[] | undefined;
}

export const BlockSchema: v.GenericSchema<Block> = v.object({
  id: NodeId,
  type: BlockType,
  props: v.record(v.string(), v.unknown()),
  children: v.optional(v.array(v.lazy(() => BlockSchema))),
});

export const MAX_BLOCKS = 500;
export const MAX_DEPTH = 3;

export const BlockListSchema = v.pipe(v.array(BlockSchema), v.maxLength(MAX_BLOCKS));
export type BlockList = v.InferOutput<typeof BlockListSchema>;

export interface ContainerRule {
  allow: string[];
  min?: number;
  max?: number;
}

export interface BlockRule {
  // Strict: unknown props are rejected, not ignored. The registry builds these.
  props: v.GenericSchema<unknown, Record<string, unknown>>;
  container?: ContainerRule;
}

export type BlockRules = Record<string, BlockRule>;

export interface ContentIssue {
  path: (string | number)[];
  code: string;
  message: string;
}
