// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import type { Actor } from "@sitebuilder/auth";
import { type Auth, createAuth } from "@sitebuilder/auth/server";
import { RoleSchema } from "@sitebuilder/schema";
import { headers } from "next/headers";
import * as v from "valibot";
import { env } from "@/env";

// The site zone reads the session for one thing: draft preview (design §7, decisions #66).
// Signing in and out happen in the admin zone; the cookie is the same, on the same domain.

let instance: Auth | undefined;

function auth(): Auth {
  const { SITE_URL, AUTH_SECRET } = env();
  instance ??= createAuth({ siteUrl: SITE_URL, secret: AUTH_SECRET });
  return instance;
}

// The signed-in user, read from Postgres. Banned users and unknown roles count as signed out.
export async function getViewer(): Promise<Actor | null> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  const role = v.safeParse(RoleSchema, session.user.role);
  return role.success ? { id: session.user.id, role: role.output } : null;
}
