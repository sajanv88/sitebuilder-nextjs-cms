// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MDXComponents } from "mdx/types";
import { docsComponents } from "@/components/docs-prose/docs-prose";

// @next/mdx looks for this file: what every MDX page is drawn with.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...docsComponents, ...components };
}
