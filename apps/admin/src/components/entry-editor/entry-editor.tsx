"use client";

import { DatePicker } from "@nuvui/date-picker";
import { enGB } from "@nuvui/date-picker/locale";
import { TrashIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from "@nuvui/react";
import { createBlock } from "@sitebuilder/blocks";
import { type BlockList, ENTRY_LIMITS, type EntryKind } from "@sitebuilder/schema";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type SubmitEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { saveEntry } from "@/actions/entry-editor";
import { trashEntries } from "@/actions/entry-list";
import { BlockCanvas } from "@/components/block-canvas/block-canvas";
import { type EditorData, EditorDataProvider } from "@/components/block-editor/editor-data";
import {
  applyMove,
  duplicateBlock,
  findBlock,
  insertBlock,
  locate,
  moveBy,
  removeBlock,
  updateProps,
} from "@/components/block-editor/editor-model";
import { snapshotOf, useAutosave } from "@/components/block-editor/use-autosave";
import { BlockInserter } from "@/components/block-inserter/block-inserter";
import { BlockInspector } from "@/components/block-inspector/block-inspector";
import { BlockOutline } from "@/components/block-outline/block-outline";
import { type EditorOptions, EntrySettings } from "@/components/entry-settings/entry-settings";
import { RevisionHistory } from "@/components/revision-history/revision-history";
import { formatDateTime } from "@/lib/dates";
import type { BlockIssue, EditorEntry, EditorState } from "./editor-state";
import "./entry-editor.scss";

export type { EditorOptions } from "@/components/entry-settings/entry-settings";

// The editor for a post or a page (design §8): an inserter and an outline on one side, the page
// as visitors will see it in the middle, the selected block's fields and the entry's settings on
// the other, and a bar along the top with the status, saving, history and trash. On a phone the
// three are views one at a time; every field stays in the form either way.

const NOUNS = {
  post: { one: "post", title: "Post", many: "Posts", list: "/admin/posts" },
  page: { one: "page", title: "Page", many: "Pages", list: "/admin/pages" },
} as const satisfies Record<EntryKind, { one: string; title: string; many: string; list: Route }>;

const STATUS = {
  published: { label: "Published", intent: "success" },
  scheduled: { label: "Scheduled", intent: "primary" },
  draft: { label: "Draft", intent: "neutral" },
} as const;

// The page is drawn on the server as if there were no browser clock. Local times and the time
// zone's name are filled in once the script runs, so the two renders agree.
const subscribe = () => () => {};
function useInBrowser(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

// The publish date is nuvui's DatePicker, which picks days only (nuvui has no time picker
// yet), and the time is a Combobox of quarter hours beside it (decisions #44). Both are in the
// browser's time zone; the form sends the moment they make together, in UTC.
const pad = (n: number) => String(n).padStart(2, "0");

// Dates are typed day first (dd/mm/yyyy) and weeks start on Monday. The Settings screen will
// choose the date format later (docs/next.md); until then it's this European default.
const DATE_LOCALE = enGB;
const DATE_PATTERN = "dd/mm/yyyy";

// "14:05", the time of day in the browser's time zone.
function timeOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "00:00" to "23:45".
const QUARTER_HOURS = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);

// The next quarter hour from now, for a date picked before a time.
function nextQuarterHour(): string {
  const now = new Date();
  now.setMinutes(Math.ceil((now.getMinutes() + 1) / 15) * 15, 0, 0);
  return timeOf(now);
}

// The day at "HH:mm", in the browser's time zone.
function atTime(day: Date, time: string): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Number(time.slice(0, 2)),
    Number(time.slice(3, 5)),
  );
}

function statusLine(entry: EditorEntry | null): string {
  if (!entry) return "Not saved yet.";
  if (entry.status === "published" && entry.publishedAt) {
    return `Published ${formatDateTime(new Date(entry.publishedAt))}.`;
  }
  if (entry.status === "scheduled" && entry.publishedAt) {
    return `Scheduled for ${formatDateTime(new Date(entry.publishedAt))}. It goes live once scheduled publishing is set up (a later release).`;
  }
  return "A draft: only people who can sign in to the admin see it.";
}

type View = "blocks" | "page" | "settings";

const newest = (a: EditorEntry | null, b: EditorEntry | null): EditorEntry | null =>
  !a ? b : !b ? a : Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b;

export function EntryEditor({
  type,
  initial,
  content,
  data,
  options,
  allowed,
  created,
}: {
  type: EntryKind;
  initial: Pick<EditorState, "values" | "entry">;
  content: BlockList;
  data: EditorData;
  options: EditorOptions;
  allowed: { publish: boolean; trash: boolean; createTerms: boolean };
  created: boolean;
}) {
  const router = useRouter();
  const [state, action, saving] = useActionState(saveEntry, { result: "idle", ...initial });
  const [trashing, startTrash] = useTransition();
  const inBrowser = useInBrowser();
  const noun = NOUNS[type];
  const errors = state.errors ?? {};
  const busy = saving || trashing;

  // ── The entry, the blocks and saving ─────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial.values.title);
  const [blocks, setBlocks] = useState<BlockList>(content);
  const [featuredMediaId, setFeaturedMediaId] = useState(initial.values.featuredMediaId);
  // The id and the conflict token, which an autosave can change between saves.
  const [entryId, setEntryId] = useState(initial.entry?.id ?? "");
  const [token, setToken] = useState(initial.entry?.updatedAt ?? "");
  const [path, setPath] = useState(initial.entry?.path ?? "");
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshotOf(initial.values.title, content),
  );
  const [issues, setIssues] = useState<BlockIssue[]>([]);
  const submitted = useRef("");

  // The newest of: the last save's answer, the server's copy (which changes after a create or a
  // restored revision), and what autosave has stored since.
  const known = newest(state.entry, initial.entry);
  const entry: EditorEntry | null =
    known && known.id === entryId
      ? { ...known, path: path || known.path, updatedAt: token || known.updatedAt }
      : entryId
        ? { id: entryId, status: "draft", path, publishedAt: null, updatedAt: token }
        : known;

  // A newer copy from the server than this editor has: the entry was created with Save (the
  // action moved to its address), or a revision was restored. Take it up. An older one, such as
  // the page drawn for a draft autosave just created, changes nothing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the server's copy changes, comparing it with the editor's at that moment.
  useEffect(() => {
    const server = initial.entry;
    if (!server) return;
    if (server.id === entryId && token && Date.parse(server.updatedAt) <= Date.parse(token)) return;
    setEntryId(server.id);
    setToken(server.updatedAt);
    setPath(server.path);
    setTitle(initial.values.title);
    setBlocks(content);
    setSavedSnapshot(snapshotOf(initial.values.title, content));
    setIssues([]);
  }, [initial.entry?.id, initial.entry?.updatedAt]);

  // ── Selection and views ──────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("page");
  const [sideTab, setSideTab] = useState<"add" | "outline">("add");
  const [settingsTab, setSettingsTab] = useState<"block" | "entry">("entry");
  const selected = selectedId ? findBlock(blocks, selectedId) : undefined;
  const where = selectedId ? locate(blocks, selectedId) : undefined;
  const siblings = where ? (where.parent?.children ?? blocks).length : 0;
  const issueIds = useMemo(() => new Set(issues.map((issue) => issue.blockId)), [issues]);

  function select(id: string | null) {
    setSelectedId(id);
    if (id) setSettingsTab("block");
  }

  function add(type: string) {
    const block = createBlock(type);
    const next = insertBlock(blocks, block, selectedId);
    if (!next) {
      toast("There's no place for that block here.", { intent: "warning" });
      return;
    }
    setBlocks(next);
    select(block.id);
  }

  // ── Publishing date and time ─────────────────────────────────────────────────────────────
  const [pickedDay, setPickedDay] = useState<Date | null>();
  const [pickedTime, setPickedTime] = useState<string>();
  const [dayInvalid, setDayInvalid] = useState(false);
  const dayField = useRef<HTMLInputElement>(null);
  const scheduled = useMemo(() => {
    if (!inBrowser || entry?.status !== "scheduled" || !entry.publishedAt) return null;
    const at = new Date(entry.publishedAt);
    return { day: new Date(at.getFullYear(), at.getMonth(), at.getDate()), time: timeOf(at) };
  }, [inBrowser, entry?.status, entry?.publishedAt]);
  const day = pickedDay === undefined ? (scheduled?.day ?? null) : pickedDay;
  const time = pickedTime ?? scheduled?.time ?? "";
  // A time saved off the quarter hour (14:05) stays in the list, in its place.
  const times =
    time && !QUARTER_HOURS.includes(time) ? [...QUARTER_HOURS, time].sort() : QUARTER_HOURS;
  const publishAt = day && time ? atTime(day, time).toISOString() : "";
  const future = publishAt !== "" && Date.parse(publishAt) > Date.now();
  const zone = inBrowser ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  function pickDay(next: Date | null) {
    setPickedDay(next);
    setDayInvalid(false);
    if (next && !time) setPickedTime(nextQuarterHour());
  }

  // Text in the date field that isn't a date leaves no date, which would publish now. The form
  // has noValidate, so the browser doesn't stop it: stop Publish here instead.
  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    if (
      event.nativeEvent.submitter?.getAttribute("value") === "publish" &&
      dayField.current &&
      !dayField.current.validity.valid
    ) {
      event.preventDefault();
      setDayInvalid(true);
      setView("settings");
      setSettingsTab("entry");
      dayField.current.focus();
      return;
    }
    submitted.current = snapshotOf(title, blocks);
  }

  // ── After a save ─────────────────────────────────────────────────────────────────────────
  // One toast per save, and one when the editor opens on something just created. Each has an
  // id, so an effect that runs twice (React does in development) shows it once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per save answer; the blocks and title it compares are read at that moment on purpose.
  useEffect(() => {
    if (state.result === "saved" && state.savedAt && state.entry) {
      toast(state.message ?? "Saved.", { intent: "success", id: `saved-${state.savedAt}` });
      setToken(state.entry.updatedAt);
      setEntryId(state.entry.id);
      setPath(state.entry.path);
      setIssues([]);
      // The stored blocks have their rich text cleaned. Take them up, unless more was typed
      // while the save was on its way.
      if (state.content && snapshotOf(title, blocks) === submitted.current) {
        setBlocks(state.content);
        setSavedSnapshot(snapshotOf(state.values.title, state.content));
      } else {
        setSavedSnapshot(submitted.current);
      }
    }
    if (state.result === "invalid" && state.blockIssues) {
      setIssues(state.blockIssues);
      const first = state.blockIssues.find((issue) => issue.blockId)?.blockId;
      if (first) select(first);
    }
  }, [state]);

  useEffect(() => {
    if (!created || !state.entry) return;
    toast(`${noun.title} created`, { intent: "success", id: `created-${state.entry.id}` });
    // Drop ?created=1, so a reload doesn't say it again.
    router.replace(`${noun.list}/${state.entry.id}` as Route, { scroll: false });
  }, [created, state.entry, noun.title, noun.list, router]);

  // ── Autosave: drafts only ────────────────────────────────────────────────────────────────
  const status = useAutosave({
    enabled: (entry === null || entry.status === "draft") && !busy,
    type,
    entryId,
    token,
    title,
    blocks,
    savedSnapshot,
    onSaved: (saved) => {
      setToken(saved.updatedAt);
      setSavedSnapshot(saved.snapshot);
      setPath(saved.path);
      if (!entryId) {
        setEntryId(saved.id);
        // The new draft's own address, for a reload or a shared link. Only the address
        // changes: navigating would remount the editor (Next keys a segment by its id) and
        // lose what isn't saved yet, such as an excerpt typed meanwhile.
        window.history.replaceState(window.history.state, "", `${noun.list}/${saved.id}`);
      }
    },
    onIssues: setIssues,
  });

  function trash() {
    if (!entry) return;
    startTrash(async () => {
      const result = await trashEntries([entry.id]);
      if (!result.ok || result.done === 0) {
        toast(result.ok ? "It couldn't be moved to the trash." : result.error, {
          intent: "danger",
        });
        return;
      }
      toast("Moved to the trash", { intent: "success" });
      router.push(noun.list);
    });
  }

  const live = entry?.status === "published" || entry?.status === "scheduled";
  const publishLabel = future ? "Schedule" : entry?.status === "published" ? "Update" : "Publish";
  const saveState =
    saving || status.state === "saving"
      ? "Saving…"
      : status.state === "saved"
        ? `Saved at ${status.at}`
        : status.state === "dirty"
          ? "Unsaved changes"
          : status.state === "problem"
            ? `Not saved: ${status.message}`
            : "";

  const publishing = (
    <>
      <p className="entry-editor__note">{statusLine(entry)}</p>
      {allowed.publish ? (
        <>
          <Field>
            <FieldLabel>Publish date</FieldLabel>
            <FieldControl>
              <DatePicker
                ref={dayField}
                value={day}
                onValueChange={pickDay}
                locale={DATE_LOCALE}
                placeholder={DATE_PATTERN}
                invalidMessage={`Enter a date as ${DATE_PATTERN}.`}
              />
            </FieldControl>
            <FieldDescription>
              Empty publishes now. A later date and time schedules it.
            </FieldDescription>
            <FieldError>
              {dayInvalid ? `Enter a date as ${DATE_PATTERN}, or clear it.` : errors.publishAt}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel>Publish time</FieldLabel>
            <Combobox value={time} onValueChange={setPickedTime}>
              <FieldControl>
                <ComboboxTrigger>
                  <ComboboxValue placeholder="Pick a time" />
                </ComboboxTrigger>
              </FieldControl>
              <ComboboxContent
                aria-label="Publish time"
                label="Search times"
                searchPlaceholder="Type a time, such as 14:30"
              >
                <ComboboxEmpty>No time found. Times go in quarter hours.</ComboboxEmpty>
                {times.map((option) => (
                  <ComboboxItem key={option} value={option}>
                    {option}
                  </ComboboxItem>
                ))}
              </ComboboxContent>
            </Combobox>
            <FieldDescription>
              24-hour clock{zone ? `, in your time zone, ${zone}` : null}.
            </FieldDescription>
          </Field>
        </>
      ) : null}
    </>
  );

  return (
    <EditorDataProvider initial={data}>
      <form action={action} onSubmit={onSubmit} className="entry-editor" noValidate>
        <input type="hidden" name="id" value={entryId} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="updatedAt" value={token} />
        <input type="hidden" name="publishAt" value={publishAt} />
        <input type="hidden" name="content" value={JSON.stringify(blocks)} />
        <input type="hidden" name="featuredMediaId" value={featuredMediaId} />

        <header className="entry-editor__head">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={noun.list}>{noun.many}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title || `New ${noun.one}`}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="entry-editor__row">
            <div className="entry-editor__heading">
              <h1 className="entry-editor__title">{title || `New ${noun.one}`}</h1>
              {entry ? (
                <Badge intent={STATUS[entry.status].intent} variant="outline">
                  {STATUS[entry.status].label}
                </Badge>
              ) : null}
              <span className="entry-editor__save-state" role="status">
                {saveState}
              </span>
            </div>
            <div className="entry-editor__actions">
              {entry ? <RevisionHistory entryId={entry.id} updatedAt={token} /> : null}
              {entry && allowed.trash ? (
                <Button intent="ghost" onClick={trash} disabled={busy}>
                  <TrashIcon size={16} />
                  Move to trash
                </Button>
              ) : null}
              {allowed.publish && live ? (
                <Button
                  type="submit"
                  name="intent"
                  value="unpublish"
                  intent="secondary"
                  disabled={busy}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  type="submit"
                  name="intent"
                  value="save"
                  intent={allowed.publish ? "secondary" : "primary"}
                  disabled={busy}
                >
                  {allowed.publish ? "Save draft" : "Save"}
                </Button>
              )}
              {allowed.publish ? (
                <Button
                  type="submit"
                  name="intent"
                  value="publish"
                  disabled={busy}
                  aria-busy={saving}
                >
                  {publishLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        {state.result === "conflict" || state.result === "failed" || state.result === "invalid" ? (
          <Alert intent={state.result === "invalid" ? "warning" : "danger"} role="alert">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Below lg, one of the three at a time. Every pane stays in the form. */}
        <ToggleGroup
          type="single"
          size="sm"
          value={view}
          onValueChange={(next) => next && setView(next as View)}
          aria-label="Show"
          className="entry-editor__views"
        >
          <ToggleGroupItem value="blocks">Add and outline</ToggleGroupItem>
          <ToggleGroupItem value="page">{noun.title}</ToggleGroupItem>
          <ToggleGroupItem value="settings">Settings</ToggleGroupItem>
        </ToggleGroup>

        <div className={`entry-editor__body entry-editor__body--view-${view}`}>
          <section
            className="entry-editor__pane entry-editor__pane--blocks"
            aria-label="Add blocks and outline"
          >
            <Tabs value={sideTab} onValueChange={(next) => setSideTab(next as "add" | "outline")}>
              <TabsList>
                <TabsTrigger value="add">Add</TabsTrigger>
                <TabsTrigger value="outline">Outline</TabsTrigger>
              </TabsList>
              <TabsContent value="add" className="entry-editor__tab">
                <BlockInserter onAdd={add} />
              </TabsContent>
              <TabsContent value="outline" className="entry-editor__tab">
                <BlockOutline
                  blocks={blocks}
                  selectedId={selectedId}
                  issueIds={issueIds}
                  onSelect={select}
                  onMove={(move) => setBlocks((now) => applyMove(now, move))}
                />
              </TabsContent>
            </Tabs>
          </section>

          <section className="entry-editor__pane entry-editor__pane--page" aria-label={noun.title}>
            <Field required>
              <FieldLabel>Title</FieldLabel>
              <FieldControl>
                <Input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  maxLength={ENTRY_LIMITS.title}
                  className="entry-editor__title-input"
                />
              </FieldControl>
              <FieldError>{errors.title}</FieldError>
            </Field>
            <BlockCanvas
              blocks={blocks}
              selectedId={selectedId}
              issueIds={issueIds}
              onSelect={select}
            />
          </section>

          <section
            className="entry-editor__pane entry-editor__pane--settings"
            aria-label="Settings"
          >
            <Tabs
              value={settingsTab}
              onValueChange={(next) => setSettingsTab(next as "block" | "entry")}
            >
              <TabsList>
                <TabsTrigger value="block">Block</TabsTrigger>
                <TabsTrigger value="entry">{noun.title}</TabsTrigger>
              </TabsList>
              <TabsContent value="block" className="entry-editor__tab">
                <BlockInspector
                  block={selected}
                  issues={issues}
                  canMoveUp={(where?.index ?? 0) > 0}
                  canMoveDown={where !== undefined && where.index < siblings - 1}
                  onChange={(props) =>
                    selectedId && setBlocks((now) => updateProps(now, selectedId, props))
                  }
                  onMove={(step) => selectedId && setBlocks((now) => moveBy(now, selectedId, step))}
                  onDuplicate={() => {
                    if (!selectedId) return;
                    const copied = duplicateBlock(blocks, selectedId);
                    if (!copied) {
                      toast("There's no room for another one here.", { intent: "warning" });
                      return;
                    }
                    setBlocks(copied.blocks);
                    select(copied.copyId);
                  }}
                  onRemove={() => {
                    if (!selectedId) return;
                    setBlocks((now) => removeBlock(now, selectedId));
                    setSelectedId(null);
                  }}
                />
              </TabsContent>
              {/* Mounted while hidden: its fields go with every save. */}
              <TabsContent
                value="entry"
                forceMount
                hidden={settingsTab !== "entry"}
                className="entry-editor__tab"
              >
                <EntrySettings
                  type={type}
                  values={state.values}
                  errors={errors}
                  entry={entry}
                  options={options}
                  createTerms={allowed.createTerms}
                  publishing={publishing}
                  featuredMediaId={featuredMediaId}
                  onFeaturedChange={setFeaturedMediaId}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </form>
    </EditorDataProvider>
  );
}
