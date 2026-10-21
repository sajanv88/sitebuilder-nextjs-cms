"use client";

import { FileTextIcon, VideoIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { DataTable, DataTableToolbar } from "@nuvui/table";
import { createColumnHelper, useDataTable } from "@nuvui/table/full";
import type { MediaList, MediaRow } from "@sitebuilder/db";
import type { MediaKind, MediaListQuery } from "@sitebuilder/schema";
import type { PaginationState, Updater } from "@tanstack/react-table";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MediaDetailsSheet } from "@/components/media-details/media-details";
import { formatDateTime } from "@/lib/dates";
import { describeType, formatBytes, isImage } from "@/lib/format";
import "./media-table.scss";

// The Media screen's list (design §8), a DataTable in server mode as on Posts: the kind, the
// page and the search live in the URL and the server sends one page, newest first. A file's
// name opens its details in a sheet.

const KINDS: { value: "all" | MediaKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
];

function search(query: MediaListQuery): string {
  const params = new URLSearchParams();
  if (query.kind !== "all") params.set("kind", query.kind);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.size !== 20) params.set("size", String(query.size));
  if (query.q) params.set("q", query.q);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function apply<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

// A thumbnail for images; an icon for the rest.
export function MediaThumb({ row }: { row: Pick<MediaRow, "mimeType"> & { url: string } }) {
  if (isImage(row.mimeType)) {
    // biome-ignore lint/performance/noImgElement: files are served by the site zone at /media/; next/image here would fetch them from the admin zone, which doesn't serve them (decisions #58).
    return <img className="media-table__thumb" src={row.url} alt="" loading="lazy" />;
  }
  const Icon = row.mimeType.startsWith("video/") ? VideoIcon : FileTextIcon;
  return (
    <span className="media-table__thumb media-table__thumb--icon">
      <Icon aria-hidden="true" size={20} />
    </span>
  );
}

const helper = createColumnHelper<MediaRow>();

export function MediaTable({ list, query }: { list: MediaList; query: MediaListQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  function go(next: Partial<MediaListQuery>) {
    startTransition(() => {
      router.replace(`${pathname}${search({ ...query, ...next })}` as Route, { scroll: false });
    });
  }

  const pagination: PaginationState = { pageIndex: list.page - 1, pageSize: query.size };

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("filename", {
          header: "File",
          enableHiding: false,
          enableSorting: false,
          cell: ({ row }) => (
            <span className="media-table__file">
              <MediaThumb
                row={{ mimeType: row.original.mimeType, url: `/media/${row.original.storageKey}` }}
              />
              <Button
                intent="ghost"
                size="sm"
                className="media-table__name"
                onClick={() => setOpen(row.original.id)}
              >
                {row.original.filename}
              </Button>
            </span>
          ),
        }),
        helper.accessor((row) => describeType(row.mimeType), {
          id: "type",
          header: "Type",
          enableSorting: false,
        }),
        helper.accessor((row) => formatBytes(row.sizeBytes), {
          id: "size",
          header: "Size",
          enableSorting: false,
        }),
        helper.accessor(
          (row) => (row.width && row.height ? `${row.width} × ${row.height}` : "None"),
          {
            id: "dimensions",
            header: "Dimensions",
            enableSorting: false,
          },
        ),
        helper.accessor((row) => row.uploadedBy.name, {
          id: "uploader",
          header: "Uploaded by",
          enableSorting: false,
        }),
        helper.accessor((row) => formatDateTime(row.createdAt), {
          id: "date",
          header: "Uploaded",
          enableSorting: false,
        }),
      ]),
    [],
  );

  const table = useDataTable({
    columns,
    data: list.rows,
    rowCount: list.total,
    getRowId: (row) => row.id,
    state: { pagination, globalFilter: query.q },
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
    manualPagination: true,
    manualFiltering: true,
  });

  const kindLabel = KINDS.find((kind) => kind.value === query.kind)?.label ?? "All";

  return (
    <div className="media-table">
      <nav className="media-table__kinds" aria-label="Filter media">
        {KINDS.map((kind) => {
          const current = kind.value === query.kind;
          return (
            <Button key={kind.value} asChild intent={current ? "secondary" : "ghost"} size="sm">
              <Link
                href={`${pathname}${search({ ...query, kind: kind.value, page: 1 })}` as Route}
                aria-current={current ? "page" : undefined}
                scroll={false}
              >
                {kind.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <DataTable
        table={table}
        aria-label={`${kindLabel === "All" ? "All media" : kindLabel}`}
        rowHeader="filename"
        loading={pending}
        pageSizes={[10, 20, 50]}
        empty={query.q ? `No files match “${query.q}”.` : "No files here yet. Upload some above."}
        toolbar={
          <DataTableToolbar>
            <table.Filter debounce={300} />
            <span className="media-table__gap" />
            <table.ColumnChooser />
          </DataTableToolbar>
        }
      />
      <MediaDetailsSheet
        id={open}
        onClose={() => setOpen(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
