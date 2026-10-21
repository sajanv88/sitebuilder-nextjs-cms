// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { type Auth, createAuth } from "@sitebuilder/auth/server";
import { env } from "@/env";

let instance: Auth | undefined;

// Better Auth for this zone (packages/auth). Created on first use, not at import, so
// `next build` needs no secrets.
export function auth(): Auth {
  const { SITE_URL, AUTH_SECRET } = env();
  instance ??= createAuth({ siteUrl: SITE_URL, secret: AUTH_SECRET });
  return instance;
}
