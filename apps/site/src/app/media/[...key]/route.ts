// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { db, getMediaByKey, getSettings } from "@sitebuilder/db";
import { isShareValid, isStorageKey, parseRange, storageFor } from "@sitebuilder/media";
import { getViewer } from "@/auth/session";
import { env } from "@/env";

// Every uploaded file, at /media/<key> (decisions #47), whichever storage holds it: the media
// volume, or an S3 bucket read with the stored or environment credentials, so a bucket can stay
// private and an address survives a change of storage. One range per request is honoured, for
// video seeking. The key holds a uuid, so a response never changes and is cached for a year.
//
// Only files the media table knows are served: a key that isn't a row is a 404, whatever is in
// storage. The type is the one decided from the file's bytes on upload, sent with nosniff.
//
// A private file (decisions #149) is served only with a share link that hasn't ended, or to
// someone signed in who may see it; never cached, by a browser or anything between. To anyone
// else it doesn't exist.

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: RouteContext<"/media/[...key]">,
): Promise<Response> {
  const key = (await params).key.join("/");
  if (!isStorageKey(key)) return notFound();
  const file = await getMediaByKey(db, key);
  if (!file) return notFound();
  if (file.private) {
    const url = new URL(request.url);
    const shared = isShareValid(
      key,
      { expires: url.searchParams.get("expires"), sig: url.searchParams.get("sig") },
      env().AUTH_SECRET,
    );
    if (!shared) {
      const viewer = await getViewer();
      if (!viewer || !can(viewer, "media.read", { type: "media", ownerId: file.uploadedBy })) {
        return notFound();
      }
    }
  }

  const source = storageFor(file.storage, {
    settings: await getSettings(db, "media"),
    env: env(),
  });
  if (!source.ok) {
    console.error("media: no storage can serve", key, source.reason);
    return new Response("This file can't be served right now.", { status: 503 });
  }

  const range = parseRange(request.headers.get("range"), file.sizeBytes);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${file.sizeBytes}` },
    });
  }

  let body: ReadableStream<Uint8Array> | null;
  try {
    body = await source.storage.get(key, range ?? undefined);
  } catch (error) {
    console.error("media: reading from storage failed", key, error);
    return new Response("This file can't be served right now.", { status: 502 });
  }
  if (!body) return notFound();

  const headers = new Headers({
    "content-type": file.mimeType,
    "x-content-type-options": "nosniff",
    "cache-control": file.private ? "private, no-store" : "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    // Shown in the browser, and saved under its own name.
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  });
  if (range) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${file.sizeBytes}`);
    headers.set("content-length", String(range.end - range.start + 1));
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(file.sizeBytes));
  return new Response(body, { status: 200, headers });
}
