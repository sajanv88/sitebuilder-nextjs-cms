import { archivePath } from "@sitebuilder/schema";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getReadingSettings, getSite, getSitemapData } from "@/server/content";

// sitemap.xml (design §7): every public page and post, the blog and its archives, on the site's
// own address. Rendered per request from cached reads, so it never needs the database at build.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [site, reading, data] = await Promise.all([
    getSite(),
    getReadingSettings(),
    getSitemapData(),
  ]);
  const url = (path: string) => new URL(path, site.siteUrl).toString();
  return [
    { url: url("/") },
    { url: url(reading.postsPath) },
    ...data.entries
      .filter((entry) => entry.id !== data.homepageEntryId)
      .map((entry) => ({ url: url(entry.path), lastModified: entry.updatedAt })),
    ...data.terms.map((term) => ({
      url: url(archivePath(reading.postsPath, term.taxonomy, term.slug)),
    })),
  ];
}
