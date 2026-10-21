import { RowsIcon } from "@nuvui/icons";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import type { BlockDefinition } from "../../types";
import "./block-column.scss";

const Props = v.strictObject({});
type Props = v.InferOutput<typeof Props>;

// One column of a `columns` block: any leaf block, 0 to 30 (design §5.2).
export const column: BlockDefinition<Props> = {
  type: "column",
  label: "Column",
  description: "One column inside Columns.",
  category: "layout",
  icon: RowsIcon,
  props: Props,
  defaults: () => ({}),
  container: { allow: "leaves", min: 0, max: 30 },
  fields: [],
  summary: () => "Column",
  Render: ({ children, context }) => (
    <div className="block-column">
      {children ??
        (context.editing ? (
          <BlockPlaceholder icon={RowsIcon}>Add blocks to this column</BlockPlaceholder>
        ) : null)}
    </div>
  ),
};
