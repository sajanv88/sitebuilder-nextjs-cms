// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type Action, type Actor, can, canSome, type Resource } from "@sitebuilder/auth";
import { RoleSchema } from "@sitebuilder/schema";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import * as v from "valibot";
import { auth } from "./auth";

export interface Viewer extends Actor {
  name: string;
  email: string;
}

// The signed-in user, read from Postgres once per request: the layout, the page and the
// components streamed into it share the answer. A session whose role isn't one of ours, or
// whose user is banned, counts as signed out. Server Actions are requests of their own, so each
// still reads it fresh.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Request time first: auth() reads the environment, which `next build` doesn't have, and the
  // session check compares its expiry with the current time. headers() alone isn't enough: in
  // development the page is still being prerendered with them, where new Date() isn't allowed.
  await connection();
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session || session.user.banned) return null;
  const role = v.safeParse(RoleSchema, session.user.role);
  if (!role.success) return null;
  return {
    id: session.user.id,
    role: role.output,
    name: session.user.name,
    email: session.user.email,
  };
});

// For admin pages: signed out → sign-in; signed in but not allowed → 404, so a screen the role
// can't use doesn't reveal that it exists (an author never sees Pages, §6.2).
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/admin/sign-in");
  return viewer;
}

export async function requirePermission(action: Action, resource?: Resource): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!can(viewer, action, resource)) notFound();
  return viewer;
}

// For a screen that lists what the viewer may act on, possibly only their own items.
export async function requireSomePermission(action: Action): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!canSome(viewer, action)) notFound();
  return viewer;
}
