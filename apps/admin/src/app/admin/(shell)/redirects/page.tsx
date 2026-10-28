// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { db, listRedirects } from "@sitebuilder/db";
import type { Metadata } from "next";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { RedirectManager } from "@/components/redirect-manager/redirect-manager";

export const metadata: Metadata = { title: "Redirects" };

// Redirects (decisions #145): every one, the ones moved pages wrote and the ones written here.
// Admins and editors.
export default async function RedirectsPage() {
  await requirePermission("redirect.manage");
  const rows = await listRedirects(db);
  return (
    <AdminPage
      title="Redirects"
      trail={[]}
      description="Old addresses that send visitors on to new ones. Moving a page or post adds one; add your own for addresses from an old site."
      facts={[{ label: "Redirects", value: rows.length }]}
    >
      <RedirectManager
        rows={rows.map((row) => ({
          fromPath: row.fromPath,
          toPath: row.toPath,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </AdminPage>
  );
}
