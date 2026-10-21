import * as v from "valibot";
import {
  type Block,
  type BlockList,
  BlockListSchema,
  type BlockRules,
  type ContentIssue,
  MAX_BLOCKS,
  MAX_DEPTH,
} from "./blocks";

export type BlockListResult =
  | { ok: true; value: BlockList }
  | { ok: false; issues: ContentIssue[] };

type Path = (string | number)[];

function issuePath(issue: v.BaseIssue<unknown>): Path {
  return (issue.path ?? []).map((item) =>
    typeof item.key === "number" ? item.key : String(item.key),
  );
}

// The only function that decides whether content may be stored (design §5.2). Checks, in order:
// shape, limits, known types, props, containers. Rich-text sanitising (check 6) is added with the
// rich-text block in phase 3 (docs/decisions.md #10).
export function validateBlockList(input: unknown, rules: BlockRules): BlockListResult {
  // 1. Shape.
  const shape = v.safeParse(BlockListSchema, input);
  if (!shape.success) {
    return {
      ok: false,
      issues: shape.issues.map((issue) => ({
        path: issuePath(issue),
        code: "invalid-shape",
        message: issue.message,
      })),
    };
  }

  const issues: ContentIssue[] = [];

  // 2. Limits: total count, depth and unique ids.
  let total = 0;
  const seen = new Set<string>();
  const countAndCheck = (blocks: Block[], depth: number, base: Path): void => {
    blocks.forEach((block, index) => {
      const path = [...base, index];
      total += 1;
      if (depth > MAX_DEPTH) {
        issues.push({ path, code: "too-deep", message: `Blocks nest at most ${MAX_DEPTH} levels` });
      }
      if (seen.has(block.id)) {
        issues.push({
          path: [...path, "id"],
          code: "duplicate-id",
          message: "Block ids must be unique",
        });
      }
      seen.add(block.id);
      if (block.children) countAndCheck(block.children, depth + 1, [...path, "children"]);
    });
  };
  countAndCheck(shape.output, 1, []);
  if (total > MAX_BLOCKS) {
    issues.push({ path: [], code: "too-many-blocks", message: `At most ${MAX_BLOCKS} blocks` });
  }
  if (issues.length > 0) return { ok: false, issues };

  // 3 to 5. Known types, props per type, container rules. Props come back parsed, so a schema
  // that trims or defaults values decides what is stored.
  const check = (blocks: Block[], base: Path): Block[] =>
    blocks.map((block, index) => {
      const path = [...base, index];
      const rule = rules[block.type];
      if (!rule) {
        issues.push({
          path: [...path, "type"],
          code: "unknown-type",
          message: `Unknown block type "${block.type}"`,
        });
        return block;
      }

      const props = v.safeParse(rule.props, block.props);
      if (!props.success) {
        for (const issue of props.issues) {
          issues.push({
            path: [...path, "props", ...issuePath(issue)],
            code: "invalid-props",
            message: issue.message,
          });
        }
      }

      const { container } = rule;
      const children = block.children;
      if (!container) {
        if (children !== undefined) {
          issues.push({
            path: [...path, "children"],
            code: "children-not-allowed",
            message: `"${block.type}" can't contain blocks`,
          });
        }
        return props.success ? { ...block, props: props.output } : block;
      }

      const count = children?.length ?? 0;
      if (container.min !== undefined && count < container.min) {
        issues.push({
          path: [...path, "children"],
          code: "too-few-children",
          message: `"${block.type}" needs at least ${container.min} blocks`,
        });
      }
      if (container.max !== undefined && count > container.max) {
        issues.push({
          path: [...path, "children"],
          code: "too-many-children",
          message: `"${block.type}" holds at most ${container.max} blocks`,
        });
      }
      children?.forEach((child, childIndex) => {
        if (!container.allow.includes(child.type)) {
          issues.push({
            path: [...path, "children", childIndex, "type"],
            code: "child-type-not-allowed",
            message: `"${block.type}" can't contain "${child.type}"`,
          });
        }
      });

      const checkedChildren = children ? check(children, [...path, "children"]) : undefined;
      return {
        id: block.id,
        type: block.type,
        props: props.success ? props.output : block.props,
        ...(checkedChildren ? { children: checkedChildren } : {}),
      };
    });

  const value = check(shape.output, []);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}
