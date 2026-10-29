// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { MDXContent } from "mdx/types";

// Each page's text, by slug. Listed one by one so the bundler sees every file, and so a page in
// nav.ts without its file (or the other way round) fails nav.test.ts rather than a visitor.

type Loader = () => Promise<{ default: MDXContent }>;

export const HOME: Loader = () => import("@/content/index.mdx");

export const PAGES: Record<string, Loader> = {
  "getting-started/install": () => import("@/content/getting-started/install.mdx"),
  "getting-started/create-your-account": () =>
    import("@/content/getting-started/create-your-account.mdx"),
  "getting-started/name-your-site": () => import("@/content/getting-started/name-your-site.mdx"),
  "getting-started/first-page": () => import("@/content/getting-started/first-page.mdx"),
  "getting-started/home-and-menu": () => import("@/content/getting-started/home-and-menu.mdx"),
  "pages/manage-pages": () => import("@/content/pages/manage-pages.mdx"),
  "pages/the-editor": () => import("@/content/pages/the-editor.mdx"),
  "pages/arrange-blocks": () => import("@/content/pages/arrange-blocks.mdx"),
  "pages/publishing": () => import("@/content/pages/publishing.mdx"),
  "blocks/settings": () => import("@/content/blocks/settings.mdx"),
  "blocks/text": () => import("@/content/blocks/text.mdx"),
  "blocks/media": () => import("@/content/blocks/media.mdx"),
  "blocks/layout": () => import("@/content/blocks/layout.mdx"),
  "blocks/marketing": () => import("@/content/blocks/marketing.mdx"),
  "blocks/lists-and-tables": () => import("@/content/blocks/lists-and-tables.mdx"),
  "posts/write-a-post": () => import("@/content/posts/write-a-post.mdx"),
  "posts/categories-and-tags": () => import("@/content/posts/categories-and-tags.mdx"),
  "posts/the-blog": () => import("@/content/posts/the-blog.mdx"),
  "media/the-library": () => import("@/content/media/the-library.mdx"),
  "media/upload": () => import("@/content/media/upload.mdx"),
  "media/private-files": () => import("@/content/media/private-files.mdx"),
};
