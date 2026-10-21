import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSite } from "@/server/content";

// robots.txt (design §7): everything public may be crawled; the admin and the API may not.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const site = await getSite();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/setup", "/api/"] },
    sitemap: new URL("/sitemap.xml", site.siteUrl).toString(),
  };
}
