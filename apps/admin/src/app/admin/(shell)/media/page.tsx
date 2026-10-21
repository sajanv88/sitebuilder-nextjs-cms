import { can } from "@sitebuilder/auth";
import { db, listMedia, mediaFolders } from "@sitebuilder/db";
import { MediaListQuery } from "@sitebuilder/schema";
import type { Metadata } from "next";
import * as v from "valibot";
import { requireSomePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { MediaBrowser } from "@/components/media-browser/media-browser";
import { MediaUploadDialog } from "@/components/media-upload-dialog/media-upload-dialog";
import { env } from "@/env";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "Media" };

// The media library (design §4.2, §8). Everyone's files for a role that may read any; an
// author's own otherwise (media.readOwn, §6.2).
export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const viewer = await requireSomePermission("media.read");
  const query = v.parse(MediaListQuery, await searchParams);
  const uploadedBy = can(viewer, "media.read") ? null : viewer.id;
  const [list, folders] = await Promise.all([
    listMedia(db, { ...query, uploadedBy }),
    mediaFolders(db, uploadedBy),
  ]);
  const maxBytes = env().MEDIA_MAX_BYTES;

  return (
    <AdminPage
      title="Media"
      description={
        uploadedBy
          ? "Your images, videos and documents, for pages and posts. Choose a file to see where it's used and to give it alt text."
          : "Every image, video and document on the site. Choose a file to see where it's used and to give it alt text."
      }
      width="wide"
      facts={[
        { label: "Files", value: folders.all },
        { label: "Images", value: folders.kinds.image },
        { label: "Videos", value: folders.kinds.video },
        { label: "Documents", value: folders.kinds.document },
        { label: "Largest upload", value: formatBytes(maxBytes) },
      ]}
      actions={can(viewer, "media.upload") ? <MediaUploadDialog maxBytes={maxBytes} /> : null}
    >
      <MediaBrowser list={list} query={query} folders={folders} />
    </AdminPage>
  );
}
