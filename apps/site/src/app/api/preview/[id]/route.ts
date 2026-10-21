// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { can } from "@sitebuilder/auth";
import { db, getEntryForEdit, getReading } from "@sitebuilder/db";
import { Uuid } from "@sitebuilder/schema";
import type { Route } from "next";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { env } from "@/env";

// The editor's Preview button opens this in a new tab (design §7, decisions #41): it turns on
// draft mode for this browser and sends it to the entry's address, where the proxy hands it to
// the preview route. Only someone who may read the entry in the admin gets there; anyone else
// gets a 404, which says nothing about whether the entry exists.
//
// Draft mode is a cookie that makes cached reads run fresh; it shows nothing on its own. The
// preview route checks the session and the permission again on every request.

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/preview/[id]">,
): Promise<Response> {
  const { id } = await params;
  if (!v.is(Uuid, id)) return notFound();
  const viewer = await getViewer();
  if (!viewer) return notFound();
  const entry = await getEntryForEdit(db, id);
  if (
    !entry ||
    entry.deletedAt ||
    !can(viewer, `${entry.type}.read`, { type: entry.type, ownerId: entry.author.id })
  ) {
    return notFound();
  }

  (await draftMode()).enable();
  const { homepageEntryId } = await getReading(db);
  const path = entry.id === homepageEntryId ? "/" : entry.path;
  // An absolute address on the public domain: behind a proxy the request's own may not be.
  // Next's redirect() sends the draft-mode cookie with it.
  redirect(new URL(path, env().SITE_URL).toString() as Route);
}
