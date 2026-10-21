"use client";

import { MoreHorizontalIcon } from "@nuvui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@nuvui/react";
import { DataTable, DataTableToolbar } from "@nuvui/table";
import { createColumnHelper, useDataTable } from "@nuvui/table/full";
import type { EntryList, EntryListRow } from "@sitebuilder/db";
import {
  ENTRY_SORT_KEYS,
  type EntryKind,
  type EntryListQuery,
  type EntrySort,
  type EntrySortKey,
  type EntryView,
} from "@sitebuilder/schema";
import type {
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  deleteEntries,
  type ListActionResult,
  restoreEntries,
  trashEntries,
} from "@/actions/entry-list";
import { formatDateTime } from "@/lib/dates";
import "./entry-table.scss";

// The Posts and Pages lists, from nuvui's table-toolbar block, as a DataTable in server mode.
// Sorting, paging and the search live in the URL: the page reads them on the server and sends
// one page of rows. The table only changes the URL, so Back, reload and a shared link all show
// the same list.

const VIEW_LABELS: Record<EntryView, string> = {
  all: "All",
  published: "Published",
  drafts: "Drafts",
  scheduled: "Scheduled",
  trash: "Trash",
};

const STATUS = {
  published: { label: "Published", intent: "success" },
  scheduled: { label: "Scheduled", intent: "primary" },
  draft: { label: "Draft", intent: "neutral" },
} as const;

const NOUNS = {
  post: { one: "post", many: "posts" },
  page: { one: "page", many: "pages" },
} as const satisfies Record<EntryKind, { one: string; many: string }>;

function apply<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

function isSortKey(id: string): id is EntrySortKey {
  return (ENTRY_SORT_KEYS as readonly string[]).includes(id);
}

// The query as the URL writes it, leaving defaults out.
function search(query: EntryListQuery): string {
  const params = new URLSearchParams();
  if (query.view !== "all") params.set("view", query.view);
  if (query.sort !== "-date") params.set("sort", query.sort);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.size !== 20) params.set("size", String(query.size));
  if (query.q) params.set("q", query.q);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function dateLine(row: EntryListRow): string {
  if (row.deletedAt) return `Trashed ${formatDateTime(row.deletedAt)}`;
  if (row.status === "published" && row.publishedAt) {
    return `Published ${formatDateTime(row.publishedAt)}`;
  }
  if (row.status === "scheduled" && row.publishedAt) {
    return `Scheduled for ${formatDateTime(row.publishedAt)}`;
  }
  return `Last changed ${formatDateTime(row.updatedAt)}`;
}

type Confirming = { kind: "delete"; ids: string[] } | null;

const helper = createColumnHelper<EntryListRow>();

export function EntryTable({
  type,
  list,
  query,
  allowed,
}: {
  type: EntryKind;
  list: EntryList;
  query: EntryListQuery;
  allowed: { trash: boolean; delete: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirming, setConfirming] = useState<Confirming>(null);
  const noun = NOUNS[type];
  const base = `/admin/${noun.many}`;
  const inTrash = query.view === "trash";

  function go(next: Partial<EntryListQuery>) {
    setRowSelection({});
    startTransition(() => {
      router.replace(`${pathname}${search({ ...query, ...next })}` as Route, { scroll: false });
    });
  }

  // Stable, because the columns use it.
  const run = useCallback(
    (action: (ids: string[]) => Promise<ListActionResult>, ids: string[], verb: string) => {
      startTransition(async () => {
        const result = await action(ids);
        if (!result.ok) {
          toast(result.error, { intent: "danger" });
          return;
        }
        setRowSelection({});
        const what = result.done === 1 ? `1 ${noun.one}` : `${result.done} ${noun.many}`;
        toast(`${what} ${verb}`, {
          intent: result.skipped > 0 ? "warning" : "success",
          ...(result.notes.length > 0 || result.skipped > 0
            ? {
                description:
                  result.notes.join(" ") ||
                  `${result.skipped} couldn't be changed: you may not, or it changed meanwhile.`,
              }
            : {}),
        });
        router.refresh();
      });
    },
    [noun, router],
  );

  const sorting: SortingState = [
    { id: query.sort.replace(/^-/, ""), desc: query.sort.startsWith("-") },
  ];
  const pagination: PaginationState = { pageIndex: list.page - 1, pageSize: query.size };

  const columns = useMemo(
    () =>
      helper.columns([
        ...(allowed.trash ? [helper.select()] : []),
        helper.accessor("title", {
          header: "Title",
          enableHiding: false,
          cell: ({ row }) => (
            <span className="entry-table__title">
              {inTrash ? (
                <span className="entry-table__name">{row.original.title}</span>
              ) : (
                <Link className="entry-table__name" href={`${base}/${row.original.id}` as Route}>
                  {row.original.title}
                </Link>
              )}
              <span className="entry-table__path">{row.original.path}</span>
            </span>
          ),
        }),
        helper.accessor((row) => row.author.name, { id: "author", header: "Author" }),
        ...(type === "post"
          ? [
              helper.accessor((row) => row.categories.join(", "), {
                id: "categories",
                header: "Categories",
                enableSorting: false,
                cell: (cell) => cell.getValue() || "None",
              }),
            ]
          : []),
        helper.accessor("status", {
          header: "Status",
          cell: ({ row }) => {
            const status = STATUS[row.original.status];
            return (
              <Badge intent={status.intent} variant="outline">
                {status.label}
              </Badge>
            );
          },
        }),
        helper.accessor((row) => dateLine(row), { id: "date", header: "Date" }),
        helper.display({
          id: "actions",
          header: "Actions",
          enableHiding: false,
          cell: ({ row }) => {
            const { id, title } = row.original;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    intent="ghost"
                    size="sm"
                    className="entry-table__more"
                    aria-label={`Actions for ${title}`}
                  >
                    <MoreHorizontalIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {inTrash ? (
                    <>
                      <DropdownMenuItem onSelect={() => run(restoreEntries, [id], "restored")}>
                        Restore
                      </DropdownMenuItem>
                      {allowed.delete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            intent="danger"
                            onSelect={() => setConfirming({ kind: "delete", ids: [id] })}
                          >
                            Delete permanently
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`${base}/${id}` as Route}>Edit</Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => run(trashEntries, [id], "moved to the trash")}
                      >
                        Move to trash
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ]),
    [type, base, inTrash, allowed.trash, allowed.delete, run],
  );

  const table = useDataTable({
    columns,
    data: list.rows,
    rowCount: list.total,
    getRowId: (row) => row.id,
    state: { sorting, pagination, globalFilter: query.q, rowSelection },
    onSortingChange: (updater) => {
      const [first] = apply(updater, sorting);
      const sort: EntrySort =
        first && isSortKey(first.id) ? (first.desc ? `-${first.id}` : first.id) : "-date";
      go({ sort, page: 1 });
    },
    onPaginationChange: (updater) => {
      const next = apply(updater, pagination);
      go({
        page: next.pageSize === query.size ? next.pageIndex + 1 : 1,
        size: next.pageSize === 10 || next.pageSize === 50 ? next.pageSize : 20,
      });
    },
    onGlobalFilterChange: (updater) => {
      go({ q: String(apply(updater, query.q) ?? "").slice(0, 200), page: 1 });
    },
    onRowSelectionChange: setRowSelection,
    enableMultiSort: false,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  return (
    <div className="entry-table">
      <nav className="entry-table__views" aria-label={`Filter ${noun.many}`}>
        {(Object.keys(VIEW_LABELS) as EntryView[]).map((view) => {
          const current = view === query.view;
          return (
            <Button key={view} asChild intent={current ? "secondary" : "ghost"} size="sm">
              <Link
                href={`${pathname}${search({ ...query, view, page: 1 })}` as Route}
                aria-current={current ? "page" : undefined}
                scroll={false}
              >
                {VIEW_LABELS[view]}
                <span className="entry-table__count">{list.counts[view]}</span>
              </Link>
            </Button>
          );
        })}
      </nav>
      <DataTable
        table={table}
        aria-label={`${VIEW_LABELS[query.view]} ${noun.many}`}
        rowHeader="title"
        loading={pending}
        pageSizes={[10, 20, 50]}
        empty={
          query.q
            ? `No ${noun.many} match “${query.q}”.`
            : inTrash
              ? "The trash is empty."
              : `No ${noun.many} here yet.`
        }
        toolbar={
          <DataTableToolbar>
            <table.Filter debounce={300} />
            <span className="entry-table__gap" />
            <table.ColumnChooser />
          </DataTableToolbar>
        }
        {...(allowed.trash
          ? {
              bulkActions: (selected: { id: string }[]) => {
                const ids = selected.map((row) => row.id);
                return inTrash ? (
                  <>
                    <Button
                      size="sm"
                      intent="secondary"
                      onClick={() => run(restoreEntries, ids, "restored")}
                    >
                      Restore
                    </Button>
                    {allowed.delete ? (
                      <Button
                        size="sm"
                        intent="danger"
                        onClick={() => setConfirming({ kind: "delete", ids })}
                      >
                        Delete permanently
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Button
                    size="sm"
                    intent="secondary"
                    onClick={() => run(trashEntries, ids, "moved to the trash")}
                  >
                    Move to trash
                  </Button>
                );
              },
            }
          : {})}
      />

      {/* Beside the menus, not inside an item: a menu takes its items off the page when it
          closes, and the dialog would go with them. */}
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogTitle>
            {confirming && confirming.ids.length > 1
              ? `Delete ${confirming.ids.length} ${noun.many} permanently?`
              : `Delete this ${noun.one} permanently?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its revisions go with it. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              onClick={() => {
                if (confirming) run(deleteEntries, confirming.ids, "deleted");
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
