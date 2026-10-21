import type { Metadata } from "next";
import { connection } from "next/server";
import { EntryView } from "@/components/entry-view/entry-view";
import { PostList } from "@/components/post-list/post-list";
import {
  getCardMedia,
  getEntry,
  getPostsPage,
  getReadingSettings,
  getRenderData,
  getSite,
} from "@/server/content";
import { entryMetadata, listMetadata } from "@/server/seo";

// "/": the home page chosen in Settings → Reading, or the latest posts when there's none, or
// when it's no longer published (design §4.1).

// Request time only: the home page has no params, so the build would otherwise prerender it,
// and the build has no database.
async function homeEntry() {
  await connection();
  const reading = await getReadingSettings();
  const entry = reading.homepageEntryId ? await getEntry(reading.homepageEntryId) : undefined;
  return { reading, entry };
}

export async function generateMetadata(): Promise<Metadata> {
  const { entry } = await homeEntry();
  if (!entry) return listMetadata(null, "/", 1);
  const data = await getRenderData(
    entry.content,
    entry.featuredMediaId ? [entry.featuredMediaId] : [],
  );
  return {
    ...entryMetadata(
      entry,
      "/",
      entry.featuredMediaId ? data.media[entry.featuredMediaId] : undefined,
    ),
    // The site's own name, not "Home · Site".
    title: { absolute: entry.seoTitle ?? entry.title },
  };
}

export default async function HomePage() {
  const { reading, entry } = await homeEntry();
  const site = await getSite();

  if (entry) {
    const data = await getRenderData(
      entry.content,
      entry.featuredMediaId ? [entry.featuredMediaId] : [],
    );
    return <EntryView entry={entry} data={data} site={site} postsPath={reading.postsPath} />;
  }

  const { rows, total } = await getPostsPage(1, null);
  const media = await getCardMedia(rows.flatMap((row) => row.featuredMediaId ?? []));
  return (
    <PostList
      title={site.title}
      description={site.tagline || undefined}
      posts={rows}
      total={total}
      page={1}
      perPage={reading.postsPerPage}
      basePath={reading.postsPath}
      media={media}
      site={site}
    />
  );
}
