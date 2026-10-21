import { db, listMedia } from "@sitebuilder/db";
import { MediaListQuery } from "@sitebuilder/schema";
import type { Metadata } from "next";
import * as v from "valibot";
import { can } from "@/auth/can";
import { requireSomePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { MediaTable } from "@/components/media-table/media-table";
import { MediaUploadDialog } from "@/components/media-upload-dialog/media-upload-dialog";
import { env } from "@/env";

export const metadata: Metadata = { title: "Media" };

// The media library (design §4.2, §8). Everyone's files for a role that may read any; an
// author's own otherwise (media.readOwn, §6.2).
export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const viewer = await requireSomePermission("media.read");
  const query = v.parse(MediaListQuery, await searchParams);
  const list = await listMedia(db, {
    ...query,
    uploadedBy: can(viewer, "media.read") ? null : viewer.id,
  });

  return (
    <AdminPage
      title="Media"
      actions={
        can(viewer, "media.upload") ? <MediaUploadDialog maxBytes={env().MEDIA_MAX_BYTES} /> : null
      }
    >
      <MediaTable list={list} query={query} />
    </AdminPage>
  );
}
