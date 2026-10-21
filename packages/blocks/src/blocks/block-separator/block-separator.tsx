import { MinusIcon } from "@nuvui/icons";
import { Separator } from "@nuvui/react";
import * as v from "valibot";
import type { BlockDefinition } from "../../types";

const Props = v.strictObject({});
type Props = v.InferOutput<typeof Props>;

// A line between two parts of a page. Not decorative: on a page of blocks it's what says one
// part has ended (nuvui's Separator page: pass decorative={false} then).
export const separator: BlockDefinition<Props> = {
  type: "separator",
  label: "Separator",
  description: "A line between two parts of the page.",
  category: "layout",
  icon: MinusIcon,
  props: Props,
  defaults: () => ({}),
  fields: [],
  summary: () => "Separator",
  Render: () => <Separator decorative={false} />,
};
