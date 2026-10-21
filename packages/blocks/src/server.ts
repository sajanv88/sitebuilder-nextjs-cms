// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type BlockListResult, validateBlockList } from "@sitebuilder/schema";
import sanitizeHtml from "sanitize-html";
import { blockRules } from "./registry";

// Content checks that only run on the server (design §5.2 check 6). Kept out of the main entry
// so sanitize-html never reaches a browser bundle.

// What nuvui's RichTextEditor writes (its StarterKit: paragraphs, headings, lists, quotes, code,
// rules, links and the marks), and nothing else. Links keep only http, https, mailto and tel,
// or a path on this site: the same set as the design's Url rule, so no javascript: or data:.
const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "hr",
    "a",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // A link that opens a new tab never hands the new page a way back into this one.
    a: (tagName, attribs) => ({
      tagName,
      attribs:
        attribs.target === "_blank"
          ? { ...attribs, rel: "noopener noreferrer" }
          : Object.fromEntries(Object.entries(attribs).filter(([name]) => name !== "target")),
    }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, RICH_TEXT);
}

// The one check content passes before it's stored: shape, limits, types, props, containers,
// and cleaned rich text (validateBlockList with this registry's rules).
export function validateContent(input: unknown): BlockListResult {
  return validateBlockList(input, blockRules, { sanitizeHtml: sanitizeRichText });
}
