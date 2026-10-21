import { ArrowUpDownIcon } from "@nuvui/icons";
import * as v from "valibot";
import type { BlockDefinition } from "../../types";
import "./block-spacer.scss";

const Props = v.strictObject({
  size: v.optional(v.picklist(["sm", "md", "lg", "xl"]), "md"),
});
type Props = v.InferOutput<typeof Props>;

export const spacer: BlockDefinition<Props> = {
  type: "spacer",
  label: "Spacer",
  description: "Empty space between two blocks.",
  category: "layout",
  icon: ArrowUpDownIcon,
  props: Props,
  defaults: () => ({ size: "md" }),
  fields: [
    {
      kind: "choice",
      name: "size",
      label: "Height",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "xl", label: "Extra large" },
      ],
    },
  ],
  summary: (props) => `Spacer, ${props.size}`,
  Render: ({ props }) => (
    <div className={`block-spacer block-spacer--${props.size}`} aria-hidden="true" />
  ),
};
