import { archivePath, listPagePath, Uuid } from "@sitebuilder/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as v from "valibot";
import { PostList } from "@/components/post-list/post-list";
import {
  getArchiveTerm,
  getCardMedia,
  getPostsPage,
  getReadingSettings,
  getSite,
} from "@/server/content";
import { listMetadata } from "@/server/seo";

// A category's or tag's archive, under the posts path (/blog/category/news, /blog/tag/rust),
// which the term slugs are for (decisions #67).

async function load(id: string, pageText: string) {
  const page = /^[1-9]\d{0,5}$/.test(pageText) ? Number(pageText) : null;
  if (!page || !v.is(Uuid, id)) return undefined;
  const term = await getArchiveTerm(id);
  if (!term) return undefined;
  const reading = await getReadingSettings();
  return { term, page, reading, base: archivePath(reading.postsPath, term.taxonomy, term.slug) };
}

export async function generateMetadata({
  params,
}: PageProps<"/_site/term/[id]/[page]">): Promise<Metadata> {
  const { id, page } = await params;
  const found = await load(id, page);
  if (!found) return {};
  return listMetadata(found.term.name, listPagePath(found.base, found.page), found.page);
}

export default async function TermPage({ params }: PageProps<"/_site/term/[id]/[page]">) {
  const { id, page: pageText } = await params;
  const found = await load(id, pageText);
  if (!found) notFound();
  const { term, page, reading, base } = found;
  const [site, { rows, total }] = await Promise.all([getSite(), getPostsPage(page, term.id)]);
  const media = await getCardMedia(rows.flatMap((row) => row.featuredMediaId ?? []));
  return (
    <PostList
      title={term.name}
      description={
        term.taxonomy === "category" ? `Posts in ${term.name}.` : `Posts tagged ${term.name}.`
      }
      posts={rows}
      total={total}
      page={page}
      perPage={reading.postsPerPage}
      basePath={base}
      media={media}
      site={site}
    />
  );
}
