import type { MenuLocation } from "./menu";

// The tags the site zone's cached reads carry, and that every admin write invalidates
// (design §7, decisions #63). One list, so both zones spell them the same way.
export const CacheTags = {
  // Every list, path and count of entries: lists, archives, the sitemap, the feed, links.
  entries: "entries",
  // One entry's own content.
  entry: (id: string) => `entry:${id}`,
  terms: "terms",
  menu: (location: MenuLocation) => `menu:${location}`,
  // The site, reading and theme settings.
  settings: "settings",
  // Alt text and the facts a page draws an image with.
  media: "media",
  redirects: "redirects",
} as const;
