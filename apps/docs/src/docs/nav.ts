// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Every page of the documentation, in the order the sidebar lists them and "Next" follows.
// A page's text is src/content/<slug>.mdx, loaded through pages.ts; nav.test.ts checks the two
// lists match. Plain data, so the sidebar (a client component) can read it too.

export interface DocPage {
  // The address after /docs-root, such as "getting-started/first-page".
  slug: string;
  title: string;
  // One line, under the title and in the page's description for search engines.
  description: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const SECTIONS: DocSection[] = [
  {
    title: "Getting started",
    pages: [
      {
        slug: "getting-started/install",
        title: "Start Sitebuilder",
        description: "Run the site on your own computer or server, and open it for the first time.",
      },
      {
        slug: "getting-started/create-your-account",
        title: "Create your account",
        description: "Make the first admin account, then sign in to the admin.",
      },
      {
        slug: "getting-started/name-your-site",
        title: "Name your site",
        description: "Give the site its title, a tagline, its language and its address.",
      },
      {
        slug: "getting-started/first-page",
        title: "Make your first page",
        description: "Build a page from blocks, see it as visitors will, and publish it.",
      },
      {
        slug: "getting-started/home-and-menu",
        title: "Set the home page and menu",
        description: "Choose what visitors see first, and put your pages in the menu.",
      },
    ],
  },
  {
    title: "Pages and the editor",
    pages: [
      {
        slug: "pages/manage-pages",
        title: "Find and manage pages",
        description: "The list of pages: what each status means, finding one, and the trash.",
      },
      {
        slug: "pages/the-editor",
        title: "Find your way around the editor",
        description: "The three parts of the editor, the page at different widths, and shortcuts.",
      },
      {
        slug: "pages/arrange-blocks",
        title: "Move and arrange blocks",
        description: "Select, move, copy and remove blocks, and set how wide columns are.",
      },
      {
        slug: "pages/publishing",
        title: "Drafts, scheduling and publishing",
        description: "Save a draft, preview it, publish now or later, and go back to a version.",
      },
    ],
  },
];

export const ALL_PAGES: DocPage[] = SECTIONS.flatMap((section) => section.pages);

export interface Placed {
  page: DocPage;
  section: DocSection;
  previous: DocPage | null;
  next: DocPage | null;
}

// A page with its section and its neighbours in reading order, or null for an unknown slug.
export function placePage(slug: string): Placed | null {
  const index = ALL_PAGES.findIndex((page) => page.slug === slug);
  const page = ALL_PAGES[index];
  const section = SECTIONS.find((candidate) => candidate.pages.includes(page as DocPage));
  if (!page || !section) return null;
  return {
    page,
    section,
    previous: ALL_PAGES[index - 1] ?? null,
    next: ALL_PAGES[index + 1] ?? null,
  };
}

export const hrefOf = (slug: string): string => `/${slug}`;
