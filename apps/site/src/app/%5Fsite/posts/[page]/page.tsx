import { listPagePath } from "@sitebuilder/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostList } from "@/components/post-list/post-list";
import { getCardMedia, getPostsPage, getReadingSettings, getSite } from "@/server/content";
import { listMetadata } from "@/server/seo";

// The blog index, at the posts path (/blog, /blog/page/2). The proxy has checked the page
// exists (decisions #65).

function pageNumber(text: string): number | null {
  return /^[1-9]\d{0,5}$/.test(text) ? Number(text) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/_site/posts/[page]">): Promise<Metadata> {
  const page = pageNumber((await params).page) ?? 1;
  const reading = await getReadingSettings();
  return listMetadata("Posts", listPagePath(reading.postsPath, page), page);
}

export default async function PostsPage({ params }: PageProps<"/_site/posts/[page]">) {
  const page = pageNumber((await params).page);
  if (!page) notFound();
  const [site, reading, { rows, total }] = await Promise.all([
    getSite(),
    getReadingSettings(),
    getPostsPage(page, null),
  ]);
  const media = await getCardMedia(rows.flatMap((row) => row.featuredMediaId ?? []));
  return (
    <PostList
      title="Posts"
      posts={rows}
      total={total}
      page={page}
      perPage={reading.postsPerPage}
      basePath={reading.postsPath}
      media={media}
      site={site}
    />
  );
}
