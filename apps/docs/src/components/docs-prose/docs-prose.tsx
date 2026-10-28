// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Alert, AlertDescription, AlertTitle, Kbd } from "@nuvui/react";
import type { MDXComponents } from "mdx/types";
import type { Route } from "next";
import Link from "next/link";
import { type ComponentProps, isValidElement, type ReactNode } from "react";
import { Screenshot } from "@/components/screenshot/screenshot";
import "./docs-prose.scss";

// What the MDX pages are drawn with: each Markdown element gets its own class (BEM, no
// descendant selectors), headings get ids for links and the page's contents, and a few
// components are there to write with: <Note>, <Tip>, <Warning>, <Kbd> and <Screenshot>.

// A heading's words, for its id.
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function Callout({
  intent,
  title,
  children,
}: {
  intent: "info" | "success" | "warning";
  title: string;
  children: ReactNode;
}) {
  return (
    <Alert intent={intent} role="note" className="docs-prose__callout">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export const docsComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 id={slugify(textOf(children))} className="docs-prose__h2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={slugify(textOf(children))} className="docs-prose__h3">
      {children}
    </h3>
  ),
  p: (props) => <p className="docs-prose__p" {...props} />,
  ul: (props) => <ul className="docs-prose__list" {...props} />,
  ol: (props) => <ol className="docs-prose__list docs-prose__list--steps" {...props} />,
  li: (props) => <li className="docs-prose__item" {...props} />,
  strong: (props) => <strong className="docs-prose__strong" {...props} />,
  code: (props) => <code className="docs-prose__code" {...props} />,
  pre: (props) => <pre className="docs-prose__pre" {...props} />,
  hr: () => <hr className="docs-prose__rule" />,
  // A page of the docs goes through the router; anything else opens as a plain link.
  a: ({ href = "", children, ...props }: ComponentProps<"a">) =>
    href.startsWith("/") ? (
      <Link className="docs-prose__link" href={href as Route}>
        {children}
      </Link>
    ) : (
      <a className="docs-prose__link" href={href} rel="noreferrer" {...props}>
        {children}
      </a>
    ),
  Note: ({ title = "Note", children }: { title?: string; children: ReactNode }) => (
    <Callout intent="info" title={title}>
      {children}
    </Callout>
  ),
  Tip: ({ title = "Tip", children }: { title?: string; children: ReactNode }) => (
    <Callout intent="success" title={title}>
      {children}
    </Callout>
  ),
  Warning: ({ title = "Careful", children }: { title?: string; children: ReactNode }) => (
    <Callout intent="warning" title={title}>
      {children}
    </Callout>
  ),
  Kbd,
  Screenshot,
};
