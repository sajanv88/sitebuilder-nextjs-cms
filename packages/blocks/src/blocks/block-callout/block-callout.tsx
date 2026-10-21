// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { InfoIcon } from "@nuvui/icons";
import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import * as v from "valibot";
import { optionalText, text } from "../../shared";
import type { BlockDefinition } from "../../types";

// The design's variants are Alert's intents (design §5.5 asked to confirm them: they match).
const Props = v.strictObject({
  variant: v.optional(v.picklist(["info", "success", "warning", "danger"]), "info"),
  title: optionalText(80),
  body: text(1000),
});
type Props = v.InferOutput<typeof Props>;

export const callout: BlockDefinition<Props> = {
  type: "callout",
  label: "Callout",
  description: "A boxed note: information, success, a warning or a danger.",
  category: "text",
  icon: InfoIcon,
  props: Props,
  defaults: () => ({ variant: "info", body: "Something worth pointing out." }),
  fields: [
    {
      kind: "choice",
      name: "variant",
      label: "Kind",
      options: [
        { value: "info", label: "Information" },
        { value: "success", label: "Success" },
        { value: "warning", label: "Warning" },
        { value: "danger", label: "Danger" },
      ],
    },
    { kind: "text", name: "title", label: "Title", max: 80, optional: true },
    { kind: "text", name: "body", label: "Text", max: 1000, multiline: true },
  ],
  summary: (props) => props.title ?? props.body,
  // Part of the page from the start, not news: role="note", as nuvui's Alert page advises for a
  // message that's always there, rather than status or alert.
  Render: ({ props }) => (
    <Alert intent={props.variant} role="note">
      {props.title ? <AlertTitle>{props.title}</AlertTitle> : null}
      <AlertDescription>{props.body}</AlertDescription>
    </Alert>
  ),
};
