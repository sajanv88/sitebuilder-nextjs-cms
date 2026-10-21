"use client";

import {
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  VideoIcon,
} from "@nuvui/icons";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  paginationRange,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
  Tree,
  TreeItem,
} from "@nuvui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table";
import type { MediaFolders, MediaList, MediaRow } from "@sitebuilder/db";
import type { MediaListQuery } from "@sitebuilder/schema";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useDateSettings, useFormatDateTime } from "@/components/date-settings/date-settings";
import { MediaDetailsSheet, MediaFileDetails } from "@/components/media-details/media-details";
import { describeType, formatBytes, isImage } from "@/lib/format";
import "./media-browser.scss";

// The media library, after nuvui's file-browser block: the library's folders as a Tree (every
// file, each kind, each month files came in), the files in the chosen one as a grid of
// pictures or a list, and the chosen file's details in a panel beside them (a sheet on a
// narrow screen). The folder, the search, the view and the page live in the URL, so the
// server sends one page and Back works.

function search(query: MediaListQuery): string {
  const params = new URLSearchParams();
  if (query.kind !== "all") params.set("kind", query.kind);
  if (query.month) params.set("month", query.month);
  if (query.view !== "grid") params.set("view", query.view);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.size !== 20) params.set("size", String(query.size));
  if (query.q) params.set("q", query.q);
  const text = params.toString();
  return text ? `?${text}` : "";
}

// From this width the details sit beside the files; below it they open in a sheet. The same
// width is in media-browser.scss.
const WIDE = "(width >= 80rem)";

function subscribe(change: () => void) {
  const query = matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

// Drawn on the server as if wide; the stylesheet keeps a narrow screen right until this runs.
function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(WIDE).matches,
    () => true,
  );
}

const url = (row: MediaRow) => `/media/${row.storageKey}`;

function Thumb({ row, size }: { row: MediaRow; size: "small" | "large" }) {
  const className = `media-browser__thumb media-browser__thumb--${size}`;
  if (isImage(row.mimeType)) {
    // biome-ignore lint/performance/noImgElement: files are served by the site zone at /media/; next/image here would fetch them from the admin zone, which doesn't serve them (decisions #58).
    return <img className={className} src={url(row)} alt="" loading="lazy" />;
  }
  const Icon = row.mimeType.startsWith("video/") ? VideoIcon : FileTextIcon;
  return (
    <span className={`${className} media-browser__thumb--icon`}>
      <Icon aria-hidden="true" size={size === "large" ? 32 : 18} />
    </span>
  );
}

// "2026-10" → "October 2026", in the site's language.
function monthName(month: string, language: string): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, number - 1, 1)));
}

export function MediaBrowser({
  list,
  query,
  folders,
}: {
  list: MediaList;
  query: MediaListQuery;
  folders: MediaFolders;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const isWide = useWide();
  const formatDateTime = useFormatDateTime();
  const { language } = useDateSettings();

  const href = (next: Partial<MediaListQuery>) =>
    `${pathname}${search({ ...query, ...next })}` as Route;
  function go(next: Partial<MediaListQuery>) {
    startTransition(() => router.replace(href(next), { scroll: false }));
  }

  // The search, sent a moment after typing stops.
  const [typed, setTyped] = useState(query.q);
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only typing sends a search; the query it's sent into is read when it fires.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => go({ q: typed.trim().slice(0, 200), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // ── The folders ───────────────────────────────────────────────────────────────────────────
  const years = [...new Set(folders.months.map((m) => m.month.slice(0, 4)))];
  const folder = query.month
    ? `month:${query.month}`
    : query.kind === "all"
      ? "all"
      : `kind:${query.kind}`;
  const [expanded, setExpanded] = useState<string[]>(() => [
    "by-month",
    ...(query.month
      ? [`year:${query.month.slice(0, 4)}`]
      : years.slice(0, 1).map((y) => `year:${y}`)),
  ]);

  function openFolder(value: string | undefined) {
    if (!value || value === "by-month" || value.startsWith("year:")) return;
    setChosen(null);
    if (value === "all") go({ kind: "all", month: "", page: 1 });
    else if (value.startsWith("kind:")) {
      go({ kind: value.slice(5) as MediaListQuery["kind"], month: "", page: 1 });
    } else if (value.startsWith("month:")) go({ kind: "all", month: value.slice(6), page: 1 });
  }

  const label = (text: string, count: number, Icon: typeof FolderIcon) => (
    <span className="media-browser__folder">
      <Icon aria-hidden="true" size={16} className="media-browser__icon" />
      <span className="media-browser__folder-name">{text}</span>
      <span className="media-browser__count">{count}</span>
    </span>
  );

  const folderName =
    folder === "all"
      ? "All files"
      : query.month
        ? monthName(query.month, language)
        : { image: "Images", video: "Videos", document: "Documents" }[
            query.kind as "image" | "video" | "document"
          ];

  // ── The files ─────────────────────────────────────────────────────────────────────────────
  const pages = Math.max(1, Math.ceil(list.total / query.size));
  const chosenRow = list.rows.find((row) => row.id === chosen) ?? null;
  const refresh = () => router.refresh();

  return (
    <div className="media-browser" data-panel={isWide ? "beside" : "sheet"}>
      <nav className="media-browser__folders" aria-label="Media folders">
        <Tree
          aria-label="Media folders"
          className="media-browser__tree"
          selectionMode="single"
          value={[folder]}
          onValueChange={(value) => openFolder(value[0])}
          expanded={expanded}
          onExpandedChange={setExpanded}
        >
          <TreeItem
            value="all"
            textValue="All files"
            label={label("All files", folders.all, FolderIcon)}
          />
          <TreeItem
            value="kind:image"
            textValue="Images"
            label={label("Images", folders.kinds.image, ImageIcon)}
          />
          <TreeItem
            value="kind:video"
            textValue="Videos"
            label={label("Videos", folders.kinds.video, VideoIcon)}
          />
          <TreeItem
            value="kind:document"
            textValue="Documents"
            label={label("Documents", folders.kinds.document, FileTextIcon)}
          />
          {years.length > 0 ? (
            <TreeItem
              value="by-month"
              textValue="By month"
              label={label(
                "By month",
                folders.all,
                expanded.includes("by-month") ? FolderOpenIcon : FolderIcon,
              )}
            >
              {years.map((year) => (
                <TreeItem
                  key={year}
                  value={`year:${year}`}
                  textValue={year}
                  label={label(
                    year,
                    folders.months
                      .filter((m) => m.month.startsWith(year))
                      .reduce((sum, m) => sum + m.count, 0),
                    expanded.includes(`year:${year}`) ? FolderOpenIcon : FolderIcon,
                  )}
                >
                  {folders.months
                    .filter((m) => m.month.startsWith(year))
                    .map((m) => (
                      <TreeItem
                        key={m.month}
                        value={`month:${m.month}`}
                        textValue={monthName(m.month, language)}
                        label={label(monthName(m.month, language), m.count, FolderIcon)}
                      />
                    ))}
                </TreeItem>
              ))}
            </TreeItem>
          ) : null}
        </Tree>
      </nav>

      <section className="media-browser__files" aria-labelledby="media-folder-name">
        <div className="media-browser__head">
          <h2 id="media-folder-name" className="media-browser__heading">
            {folderName}
          </h2>
          <span className="media-browser__total" role="status">
            {pending ? (
              <Spinner size="sm" label="Loading" />
            ) : (
              `${list.total} ${list.total === 1 ? "file" : "files"}${query.q ? ` matching “${query.q}”` : ""}`
            )}
          </span>
        </div>
        <div className="media-browser__toolbar">
          <Input
            type="search"
            aria-label="Search files by name or alt text"
            placeholder="Search by name or alt text"
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            className="media-browser__search"
          />
          <ToggleGroup
            type="single"
            value={query.view}
            onValueChange={(value) => value && go({ view: value as MediaListQuery["view"] })}
            aria-label="Show as"
          >
            <ToggleGroupItem value="grid" aria-label="Pictures">
              <GridIcon aria-hidden="true" size={16} />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List">
              <ListIcon aria-hidden="true" size={16} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {list.rows.length === 0 ? (
          <Empty className="media-browser__empty">
            <EmptyMedia>
              <FileIcon aria-hidden="true" size={24} />
            </EmptyMedia>
            <EmptyTitle>{query.q ? "No files match" : "No files here yet"}</EmptyTitle>
            <EmptyDescription>
              {query.q
                ? "Try other words, or look in All files."
                : "Upload images, videos or PDFs with the button above."}
            </EmptyDescription>
          </Empty>
        ) : query.view === "grid" ? (
          <ItemGroup
            aria-label={`${folderName}, ${list.total} files`}
            className="media-browser__grid"
          >
            {list.rows.map((row) => (
              <Item key={row.id} asChild variant="outline" className="media-browser__file">
                <button
                  type="button"
                  aria-pressed={row.id === chosen}
                  onClick={() => setChosen(row.id)}
                >
                  <ItemMedia>
                    <Thumb row={row} size="large" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="media-browser__file-name">{row.filename}</ItemTitle>
                    <ItemDescription>
                      {describeType(row.mimeType)}, {formatBytes(row.sizeBytes)}
                    </ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <TableContainer>
            <Table aria-label={`${folderName}, ${list.total} files`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">File</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Size</TableHead>
                  <TableHead scope="col">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id} data-state={row.id === chosen ? "selected" : undefined}>
                    <TableHead scope="row">
                      <span className="media-browser__row-name">
                        <Thumb row={row} size="small" />
                        <Button
                          intent="ghost"
                          size="sm"
                          aria-pressed={row.id === chosen}
                          onClick={() => setChosen(row.id)}
                        >
                          {row.filename}
                        </Button>
                      </span>
                    </TableHead>
                    <TableCell>{describeType(row.mimeType)}</TableCell>
                    <TableCell>{formatBytes(row.sizeBytes)}</TableCell>
                    <TableCell>
                      {formatDateTime(row.createdAt)} by {row.uploadedBy.name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {pages > 1 ? (
          <Pagination aria-label="Pages of files" className="media-browser__pagination">
            <PaginationList>
              <PaginationItem>
                <PaginationPrevious
                  disabled={list.page === 1}
                  {...(list.page > 1 ? { href: href({ page: list.page - 1 }) } : {})}
                />
              </PaginationItem>
              {paginationRange({ page: list.page, count: pages }).map((entry) => (
                <PaginationItem key={entry}>
                  {typeof entry === "number" ? (
                    <PaginationLink
                      href={href({ page: entry })}
                      aria-label={`Page ${entry}`}
                      active={entry === list.page}
                    >
                      {entry}
                    </PaginationLink>
                  ) : (
                    <PaginationEllipsis />
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  disabled={list.page === pages}
                  {...(list.page < pages ? { href: href({ page: list.page + 1 }) } : {})}
                />
              </PaginationItem>
            </PaginationList>
          </Pagination>
        ) : null}
      </section>

      {isWide ? (
        <aside className="media-browser__detail" aria-labelledby="media-detail-name">
          {chosenRow ? (
            <MediaFileDetails
              key={chosenRow.id}
              id={chosenRow.id}
              headingId="media-detail-name"
              onChanged={refresh}
              onDeleted={() => {
                setChosen(null);
                refresh();
              }}
            />
          ) : (
            <div className="media-browser__none">
              <h2 id="media-detail-name" className="media-browser__heading">
                Choose a file
              </h2>
              <p className="media-browser__note">
                Its preview, alt text and where it's used show here.
              </p>
            </div>
          )}
        </aside>
      ) : (
        <MediaDetailsSheet id={chosen} onClose={() => setChosen(null)} onChanged={refresh} />
      )}
    </div>
  );
}
