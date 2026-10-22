// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { PlusIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { can, canSome } from "@sitebuilder/auth";
import { type EntryKind, EntryListQuery } from "@sitebuilder/schema";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import * as v from "valibot";
import { requireSomePermission, type Viewer } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { EntryTable } from "@/components/entry-table/entry-table";
import { Loading, RowsSkeleton } from "@/components/screen-skeleton/screen-skeleton";
import { listEntriesFor } from "@/server/entries";

// The editor's route is /admin/<type>s/[id]; "new" is the id of an entry not created yet.
const SCREENS: Record<
  EntryKind,
  { title: string; create: string; path: Route; description: string }
> = {
  post: {
    title: "Posts",
    create: "New post",
    path: "/admin/posts/new" as Route,
    description:
      "News and articles, listed newest first on the blog. Drafts stay here until they're published.",
  },
  page: {
    title: "Pages",
    create: "New page",
    path: "/admin/pages/new" as Route,
    description:
      "The site's pages, each at its own address. A page can sit under another, as /about/team does.",
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The rows, streamed in after the header. The list's state comes from the URL and is parsed
// with EntryListQuery, which falls back to defaults for anything it doesn't accept.
async function EntryRows({
  viewer,
  type,
  searchParams,
}: {
  viewer: Viewer;
  type: EntryKind;
  searchParams: SearchParams;
}) {
  const query = v.parse(EntryListQuery, await searchParams);
  const list = await listEntriesFor(viewer, type, query);
  return (
    <EntryTable
      type={type}
      list={list}
      query={query}
      allowed={{
        trash: canSome(viewer, `${type}.trash`),
        delete: canSome(viewer, `${type}.delete`),
      }}
    />
  );
}

// The Posts and Pages screens: the header at once, the rows when they're read.
export async function EntryListScreen({
  type,
  searchParams,
}: {
  type: EntryKind;
  searchParams: SearchParams;
}) {
  const viewer = await requireSomePermission(`${type}.read`);
  const screen = SCREENS[type];

  return (
    <AdminPage
      title={screen.title}
      description={screen.description}
      actions={
        <>
          {can(viewer, `${type}.create`) ? (
            <Button asChild>
              <Link href={screen.path}>
                <PlusIcon aria-hidden="true" size={16} />
                {screen.create}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <Suspense
        fallback={
          <Loading label={`Loading ${screen.title.toLowerCase()}`}>
            <RowsSkeleton />
          </Loading>
        }
      >
        <EntryRows viewer={viewer} type={type} searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}
