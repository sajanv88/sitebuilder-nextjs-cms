import { TypeIcon } from "@nuvui/icons";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import type { BlockDefinition } from "../../types";
import "./block-rich-text.scss";

const Props = v.strictObject({
  html: v.pipe(v.string(), v.maxLength(100_000, "Use at most 100,000 characters")),
});
type Props = v.InferOutput<typeof Props>;

// Paragraphs, lists, quotes, code and links, written with nuvui's RichTextEditor. The HTML is
// cleaned on the server before it's stored (design §5.2 check 6), so what's drawn here is the
// cleaned HTML.
export const richText: BlockDefinition<Props> = {
  type: "rich-text",
  label: "Text",
  description: "Paragraphs with bold, italic, links and lists.",
  category: "text",
  icon: TypeIcon,
  props: Props,
  defaults: () => ({ html: "" }),
  fields: [{ kind: "richtext", name: "html", label: "Text" }],
  summary: (props) =>
    props.html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Empty text",
  Render: ({ props, context }) => {
    if (props.html.trim() === "") {
      return context.editing ? (
        <BlockPlaceholder icon={TypeIcon}>Write some text</BlockPlaceholder>
      ) : null;
    }
    return (
      <div
        className="block-rich-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised on the server with an allow-list before it was stored (packages/blocks/src/server.ts).
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    );
  },
};
