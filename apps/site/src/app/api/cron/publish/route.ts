// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createHash, timingSafeEqual } from "node:crypto";
import { db, publishDueEntries } from "@sitebuilder/db";
import { connection } from "next/server";
import { env } from "@/env";

const noStore = { "Cache-Control": "no-store" };
const digest = (value: string) => createHash("sha256").update(value).digest();

// Publishes scheduled entries whose time has come (design §7), for a cron service: Vercel Cron,
// or system cron where the admin's own timer doesn't run (decisions #75). Answers 404 unless
// CRON_SECRET is set, and 401 unless the request carries `Authorization: Bearer <CRON_SECRET>`,
// the form Vercel Cron sends. GET writes here because Vercel Cron only sends GET; the secret,
// not a cookie, authorises it, so a cross-site request can't trigger it (decisions #76).
async function publish(request: Request): Promise<Response> {
  await connection();
  const secret = env().CRON_SECRET;
  if (!secret) return new Response(null, { status: 404, headers: noStore });
  // Compared as digests: equal lengths, so the comparison takes the same time whatever is sent.
  const sent = digest(request.headers.get("authorization") ?? "");
  if (!timingSafeEqual(sent, digest(`Bearer ${secret}`))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  const ids = await publishDueEntries(db);
  return Response.json({ published: ids.length }, { headers: noStore });
}

export const GET = publish;
export const POST = publish;
