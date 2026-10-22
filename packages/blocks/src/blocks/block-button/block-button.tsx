// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { LinkIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { LinkTarget } from "@sitebuilder/schema";
import * as v from "valibot";
import { alignClass, alignField, alignProp } from "../../align/align";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { cx, newTab, text } from "../../shared";
import type { BlockDefinition } from "../../types";
import "./block-button.scss";

const Props = v.strictObject({
  label: text(60),
  href: LinkTarget,
  intent: v.optional(v.picklist(["primary", "secondary", "ghost"]), "primary"),
  size: v.optional(v.picklist(["sm", "md", "lg"]), "md"),
  openInNewTab: v.optional(v.boolean(), false),
  align: alignProp,
});
type Props = v.InferOutput<typeof Props>;

// A link that looks like a button: nuvui's Button with asChild around an <a> (nuvui
// composition rule: a button that navigates is wrong).
export const button: BlockDefinition<Props> = {
  type: "button",
  label: "Button",
  description: "A link that looks like a button.",
  category: "text",
  icon: LinkIcon,
  props: Props,
  defaults: () => ({
    label: "Get started",
    href: { kind: "url", url: "/" },
    intent: "primary",
    size: "md",
    openInNewTab: false,
  }),
  fields: [
    alignField(true),
    { kind: "text", name: "label", label: "Words on the button", max: 60 },
    { kind: "link", name: "href", label: "Goes to" },
    {
      kind: "choice",
      name: "intent",
      label: "Style",
      options: [
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
        { value: "ghost", label: "Ghost" },
      ],
    },
    {
      kind: "choice",
      name: "size",
      label: "Size",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
      ],
    },
    { kind: "toggle", name: "openInNewTab", label: "Open in a new tab" },
  ],
  summary: (props) => props.label,
  Render: ({ props, context }) => {
    const href = context.href(props.href);
    if (!href) {
      return context.editing ? (
        <BlockPlaceholder icon={LinkIcon}>The page this button linked to is gone</BlockPlaceholder>
      ) : null;
    }
    return (
      <div className={cx("block-button", alignClass(props.align))}>
        <Button asChild intent={props.intent} size={props.size}>
          <a href={href} {...newTab(props.openInNewTab)}>
            {props.label}
          </a>
        </Button>
      </div>
    );
  },
};
