import { PlusIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { type EntryKind, EntryListQuery } from "@sitebuilder/schema";
import type { Route } from "next";
import Link from "next/link";
import * as v from "valibot";
import { can, canSome } from "@/auth/can";
import { requireSomePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { EntryTable } from "@/components/entry-table/entry-table";
import { listEntriesFor } from "@/server/entries";

const SCREENS = {
  post: { title: "Posts", create: "New post", path: "/admin/posts/new" },
  page: { title: "Pages", create: "New page", path: "/admin/pages/new" },
} as const satisfies Record<EntryKind, { title: string; create: string; path: Route }>;

// The Posts and Pages screens. The list's state comes from the URL and is parsed with
// EntryListQuery, which falls back to defaults for anything it doesn't accept.
export async function EntryListScreen({
  type,
  searchParams,
}: {
  type: EntryKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireSomePermission(`${type}.read`);
  const query = v.parse(EntryListQuery, await searchParams);
  const list = await listEntriesFor(viewer, type, query);
  const screen = SCREENS[type];

  return (
    <AdminPage
      title={screen.title}
      actions={
        <>
          {/* Also in the sidebar, but there they're hidden while it's folded to icons. */}
          {type === "post" && can(viewer, "term.update") ? (
            <>
              <Button asChild intent="secondary">
                <Link href="/admin/posts/categories">Categories</Link>
              </Button>
              <Button asChild intent="secondary">
                <Link href="/admin/posts/tags">Tags</Link>
              </Button>
            </>
          ) : null}
          {can(viewer, `${type}.create`) ? (
            <Button asChild>
              <Link href={screen.path}>
                <PlusIcon size={16} />
                {screen.create}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <EntryTable
        type={type}
        list={list}
        query={query}
        allowed={{
          trash: canSome(viewer, `${type}.trash`),
          delete: canSome(viewer, `${type}.delete`),
        }}
      />
    </AdminPage>
  );
}
