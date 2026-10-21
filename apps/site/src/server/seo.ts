import "server-only";
import type { RenderMedia } from "@sitebuilder/blocks";
import type { PublicEntry } from "@sitebuilder/db";
import type { Metadata } from "next";

// Titles, descriptions, canonical addresses and Open Graph (design §7). Addresses are written
// relative; the root layout's metadataBase (the siteUrl setting) makes them absolute.

export function entryMetadata(
  entry: PublicEntry,
  path: string,
  featured: RenderMedia | undefined,
): Metadata {
  const title = entry.seoTitle ?? entry.title;
  const description = entry.seoDescription ?? entry.excerpt ?? undefined;
  const image = featured?.mimeType.startsWith("image/") ? featured : undefined;
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: entry.type === "post" ? "article" : "website",
      title,
      url: path,
      ...(description ? { description } : {}),
      ...(image
        ? {
            images: [
              {
                url: image.url,
                ...(image.width ? { width: image.width } : {}),
                ...(image.height ? { height: image.height } : {}),
                ...(image.alt ? { alt: image.alt } : {}),
              },
            ],
          }
        : {}),
      ...(entry.type === "post" && entry.publishedAt
        ? { publishedTime: entry.publishedAt.toISOString() }
        : {}),
    },
  };
}

// A list's metadata. Pages past the first aren't indexed: the posts themselves are, through
// page one, the sitemap and the feed.
export function listMetadata(title: string | null, path: string, page: number): Metadata {
  return {
    ...(title ? { title } : {}),
    alternates: { canonical: path },
    ...(page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}
