import { Uuid } from "@sitebuilder/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as v from "valibot";
import { EntryView } from "@/components/entry-view/entry-view";
import { getEntry, getReadingSettings, getRenderData, getSite } from "@/server/content";
import { entryMetadata } from "@/server/seo";

// A public page or post. The proxy rewrites its address here after finding it (decisions #65);
// /_site/… typed into the address bar goes through the proxy too, and is a 404.

async function load(id: string) {
  if (!v.is(Uuid, id)) return undefined;
  const entry = await getEntry(id);
  if (!entry) return undefined;
  const data = await getRenderData(
    entry.content,
    entry.featuredMediaId ? [entry.featuredMediaId] : [],
  );
  return { entry, data };
}

export async function generateMetadata({
  params,
}: PageProps<"/_site/entry/[id]">): Promise<Metadata> {
  const found = await load((await params).id);
  if (!found) return {};
  const { entry, data } = found;
  return entryMetadata(
    entry,
    entry.path,
    entry.featuredMediaId ? data.media[entry.featuredMediaId] : undefined,
  );
}

export default async function EntryPage({ params }: PageProps<"/_site/entry/[id]">) {
  const found = await load((await params).id);
  if (!found) notFound();
  const [site, reading] = await Promise.all([getSite(), getReadingSettings()]);
  return (
    <EntryView entry={found.entry} data={found.data} site={site} postsPath={reading.postsPath} />
  );
}
