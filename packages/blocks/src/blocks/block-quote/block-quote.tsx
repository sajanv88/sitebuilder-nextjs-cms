import { QuoteIcon } from "@nuvui/icons";
import * as v from "valibot";
import { optionalText, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-quote.scss";

const Props = v.strictObject({
  text: text(1000),
  cite: optionalText(200),
});
type Props = v.InferOutput<typeof Props>;

export const quote: BlockDefinition<Props> = {
  type: "quote",
  label: "Quote",
  description: "Someone's words, and who said them.",
  category: "text",
  icon: QuoteIcon,
  props: Props,
  defaults: () => ({ text: "A quote worth repeating." }),
  fields: [
    { kind: "text", name: "text", label: "Quote", max: 1000, multiline: true },
    { kind: "text", name: "cite", label: "Who said it", max: 200, optional: true },
  ],
  summary: (props) => props.text,
  Render: ({ props }) => (
    <figure className="block-quote">
      <blockquote className="block-quote__text">
        <p>{props.text}</p>
      </blockquote>
      {props.cite ? <figcaption className="block-quote__cite">{props.cite}</figcaption> : null}
    </figure>
  ),
};
