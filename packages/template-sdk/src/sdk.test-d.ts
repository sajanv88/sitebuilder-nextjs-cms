// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ComponentProps, ReactNode } from "react";
import { expectTypeOf, test } from "vitest";
import {
  defineBlock,
  type PageLayoutProps,
  type PostLayoutProps,
  type SiteLayout,
  type TemplateBlock,
  type TemplateBlockProps,
} from "./index";

test("defineBlock keeps the props the component declares", () => {
  const Quote = defineBlock<{ text: string; author?: string }>(({ props }) => props.text);
  expectTypeOf(Quote).toEqualTypeOf<TemplateBlock<{ text: string; author?: string }>>();
  expectTypeOf<ComponentProps<typeof Quote>["props"]["text"]>().toEqualTypeOf<string>();
});

test("a block reads media and links through the host, and nothing else", () => {
  expectTypeOf<TemplateBlockProps<object>>().toHaveProperty("media");
  expectTypeOf<TemplateBlockProps<object>>().toHaveProperty("href");
  expectTypeOf<keyof TemplateBlockProps<object>>().toEqualTypeOf<
    "props" | "media" | "href" | "editing"
  >();
});

test("a post's layout gets what a page's does, and its terms", () => {
  expectTypeOf<PostLayoutProps>().toMatchTypeOf<PageLayoutProps>();
  expectTypeOf<PostLayoutProps["terms"][number]["taxonomy"]>().toEqualTypeOf<"category" | "tag">();
});

test("the site layout wraps the page", () => {
  expectTypeOf<ComponentProps<SiteLayout>["children"]>().toEqualTypeOf<ReactNode>();
  // A layout's props are plain data: no database, no request.
  expectTypeOf<ComponentProps<SiteLayout>>().not.toHaveProperty("db");
});
