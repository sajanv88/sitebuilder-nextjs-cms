// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { connection } from "next/server";
import { getFeedPosts, getSite } from "@/server/content";

// feed.xml (design §7): RSS 2.0 with the 20 newest posts. Written by hand: every value is
// escaped, and nothing here comes from a browser.

// XML 1.0 has no place for most control characters, even escaped: they're left out.
function allowed(c: string): boolean {
  const code = c.codePointAt(0) ?? 0;
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code !== 0xfffe && code !== 0xffff)
  );
}

const escapeXml = (text: string) =>
  [...text]
    .filter(allowed)
    .join("")
    .replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(): Promise<Response> {
  await connection();
  const [site, posts] = await Promise.all([getSite(), getFeedPosts()]);
  const url = (path: string) => escapeXml(new URL(path, site.siteUrl).toString());
  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url(post.path)}</link>
      <guid isPermaLink="false">${post.id}</guid>
      <pubDate>${post.publishedAt.toUTCString()}</pubDate>${
        post.excerpt ? `\n      <description>${escapeXml(post.excerpt)}</description>` : ""
      }
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${url("/")}</link>
    <description>${escapeXml(site.tagline || site.title)}</description>
    <language>${escapeXml(site.language)}</language>
    <atom:link href="${url("/feed.xml")}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
