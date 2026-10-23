// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { DatePicker } from "@nuvui/date-picker";
import { enGB } from "@nuvui/date-picker/locale";
import {
  ExpandIcon,
  EyeIcon,
  MonitorIcon,
  RedoIcon,
  SmartphoneIcon,
  TabletIcon,
  TrashIcon,
  UndoIcon,
} from "@nuvui/icons";
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
  Kbd,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@nuvui/react";
import { CANVAS_PATH, createBlock, getBlockDefinition } from "@sitebuilder/blocks";
import {
  type BlockList,
  ENTRY_LIMITS,
  type EntryKind,
  formatHint,
  formatTime,
  fromZoned,
  inputFormat,
  weekStartsOn,
  zonedParts,
} from "@sitebuilder/schema";
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
import {
  BlockCanvas,
  type CanvasHandle,
  type Device,
} from "@/components/block-canvas/block-canvas";
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
import { useHistory } from "@/components/block-editor/use-history";
import { usePinnedBlocks } from "@/components/block-editor/use-pinned-blocks";
import { BlockInserter } from "@/components/block-inserter/block-inserter";
import { BlockInspector } from "@/components/block-inspector/block-inspector";
import { BlockOutline } from "@/components/block-outline/block-outline";
import { useDateSettings, useFormatDateTime } from "@/components/date-settings/date-settings";
import { EditorShortcuts } from "@/components/editor-shortcuts/editor-shortcuts";
import { type EditorOptions, EntrySettings } from "@/components/entry-settings/entry-settings";
import { PageSummary } from "@/components/page-summary/page-summary";
import { QuickAdd } from "@/components/quick-add/quick-add";
import { RevisionHistory } from "@/components/revision-history/revision-history";
import type { BlockIssue, EditorEntry, EditorState } from "./editor-state";
import "./entry-editor.scss";
import "@/lib/template-blocks";

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
// site's time zone, in the site's date format (Settings → Dates, decisions #69); the form sends
// the moment they make together, in UTC.
const pad = (n: number) => String(n).padStart(2, "0");

// "00:00" to "23:45".
const QUARTER_HOURS = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);

// The next quarter hour from now, for a date picked before a time. Every zone's offset is a
// whole number of quarter hours, so rounding the moment rounds the zone's clock too.
function nextQuarterHour(timeZone: string): string {
  const quarter = 15 * 60_000;
  return formatTime(new Date(Math.ceil((Date.now() + 60_000) / quarter) * quarter), timeZone);
}

// The picked day at "HH:mm", both in the site's zone.
function atTime(day: Date, time: string, timeZone: string): Date {
  const { year, month, day: date } = zonedParts(day, timeZone);
  return fromZoned(
    { year, month, day: date, hour: Number(time.slice(0, 2)), minute: Number(time.slice(3, 5)) },
    timeZone,
  );
}

function statusLine(entry: EditorEntry | null, formatDateTime: (date: Date) => string): string {
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

// Text fields keep their own keys: Ctrl+Z there undoes typing, and Delete deletes a letter.
// Dialogs, menus, lists and the outline's tree have keys of their own too.
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest(
      "input, textarea, select, [role='textbox'], [role='dialog'], [role='alertdialog'], [role='menu'], [role='tree'], [role='listbox']",
    ) !== null
  );
}

const DEVICES: { value: Device; label: string; icon: typeof MonitorIcon }[] = [
  { value: "fit", label: "Fit", icon: ExpandIcon },
  { value: "desktop", label: "Desktop", icon: MonitorIcon },
  { value: "tablet", label: "Tablet", icon: TabletIcon },
  { value: "phone", label: "Phone", icon: SmartphoneIcon },
];

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
  const dates = useDateSettings();
  const formatDateTime = useFormatDateTime();
  const noun = NOUNS[type];
  const errors = state.errors ?? {};
  const busy = saving || trashing;

  // ── The entry, the blocks and saving ─────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial.values.title);
  // The blocks, with undo and redo (use-history.ts). Each change is a step; typing in one field
  // is one step.
  const history = useHistory<BlockList>(content);
  const blocks = history.value;
  const setBlocks = history.set;
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
  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const publishButton = useRef<HTMLButtonElement>(null);

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
    history.reset(content);
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

  // What can be done to the selected block, from the inspector, the keys and quick add.
  const canMoveUp = (where?.index ?? 0) > 0;
  const canMoveDown = where !== undefined && where.index < siblings - 1;
  function moveSelected(step: -1 | 1) {
    if (!selectedId || (step < 0 ? !canMoveUp : !canMoveDown)) return;
    setBlocks((now) => moveBy(now, selectedId, step));
  }
  function duplicateSelected() {
    if (!selectedId) return;
    const copied = duplicateBlock(blocks, selectedId);
    if (!copied) {
      toast("There's no room for another one here.", { intent: "warning" });
      return;
    }
    setBlocks(copied.blocks);
    select(copied.copyId);
  }
  function removeSelected() {
    if (!selectedId) return;
    setBlocks((now) => removeBlock(now, selectedId));
    setSelectedId(null);
  }

  // From the outline in the Page tab: select the block and bring it into view. The Page tab
  // stays open, so the next heading is a click away.
  function jump(blockId: string) {
    setSelectedId(blockId);
    setView("page");
    canvas.current?.scrollTo(blockId);
  }

  // ── The canvas, pins, the device shown, quick add ────────────────────────────────────────
  // The site zone's canvas page for this entry, or for a new one (block-canvas.tsx). Fixed when
  // the editor opens: once autosave has created the entry, the canvas carries on as it is.
  const [canvasSrc] = useState(() =>
    initial.entry ? `${CANVAS_PATH}/${initial.entry.id}` : `${CANVAS_PATH}/new?type=${type}`,
  );
  const canvas = useRef<CanvasHandle>(null);
  const [pinned, setPinned] = usePinnedBlocks(data.userId);
  const [device, setDevice] = useState<Device>("fit");
  const [quickAdd, setQuickAdd] = useState(false);

  // ── Publishing date and time ─────────────────────────────────────────────────────────────
  const [pickedDay, setPickedDay] = useState<Date | null>();
  const [pickedTime, setPickedTime] = useState<string>();
  const [dayInvalid, setDayInvalid] = useState(false);
  const dayField = useRef<HTMLInputElement>(null);
  const scheduled = useMemo(() => {
    if (entry?.status !== "scheduled" || !entry.publishedAt) return null;
    const at = new Date(entry.publishedAt);
    return { day: at, time: formatTime(at, dates.timeZone) };
  }, [entry?.status, entry?.publishedAt, dates.timeZone]);
  const day = pickedDay === undefined ? (scheduled?.day ?? null) : pickedDay;
  const time = pickedTime ?? scheduled?.time ?? "";
  // A time saved off the quarter hour (14:05) stays in the list, in its place.
  const times =
    time && !QUARTER_HOURS.includes(time) ? [...QUARTER_HOURS, time].sort() : QUARTER_HOURS;
  const publishAt = day && time ? atTime(day, time, dates.timeZone).toISOString() : "";
  // "Now" only exists in the browser; the server's render doesn't guess.
  const future = inBrowser && publishAt !== "" && Date.parse(publishAt) > Date.now();
  const datePattern = formatHint(dates.dateFormat);

  function pickDay(next: Date | null) {
    setPickedDay(next);
    setDayInvalid(false);
    if (next && !time) setPickedTime(nextQuarterHour(dates.timeZone));
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
      // The router answers a Server Action at the address it knows, which for a draft that
      // autosave created is still …/new. Put the entry's own address back, as autosave does.
      const own = `${noun.list}/${state.entry.id}`;
      if (window.location.pathname !== own) {
        window.history.replaceState(window.history.state, "", own);
      }
      // The stored blocks have their rich text cleaned. Take them up, unless more was typed
      // while the save was on its way.
      if (state.content && snapshotOf(title, blocks) === submitted.current) {
        history.replace(state.content);
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

  // ── Keyboard shortcuts (editor-shortcuts.tsx lists them) ─────────────────────────────────
  // One listener, reading this render's actions through a ref.
  const keys = useRef({
    save: () => {},
    undo: history.undo,
    redo: history.redo,
    move: moveSelected,
    remove: removeSelected,
  });
  keys.current = {
    // Save draft where the bar has it, otherwise Update: the button the bar shows.
    save: () => {
      const button = saveButton.current ?? publishButton.current;
      if (button && !button.disabled) form.current?.requestSubmit(button);
    },
    undo: history.undo,
    redo: history.redo,
    move: moveSelected,
    remove: removeSelected,
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        keys.current.save();
        return;
      }
      if (ownsKeys(event.target)) return;
      if (mod && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (mod && !event.altKey && !event.shiftKey && key === "y") {
        event.preventDefault();
        keys.current.redo();
      } else if (!mod && event.altKey && (key === "arrowup" || key === "arrowdown")) {
        event.preventDefault();
        keys.current.move(key === "arrowup" ? -1 : 1);
      } else if (!mod && !event.altKey && key === "delete") {
        event.preventDefault();
        keys.current.remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <p className="entry-editor__note">{statusLine(entry, formatDateTime)}</p>
      {allowed.publish ? (
        <>
          <Field>
            <FieldLabel>Publish date</FieldLabel>
            <FieldControl>
              <DatePicker
                ref={dayField}
                value={day}
                onValueChange={pickDay}
                locale={enGB}
                timeZone={dates.timeZone}
                format={inputFormat(dates.dateFormat)}
                weekStartsOn={weekStartsOn(dates.dateFormat)}
                placeholder={datePattern}
                invalidMessage={`Enter a date as ${datePattern}.`}
              />
            </FieldControl>
            <FieldDescription>
              Empty publishes now. A later date and time schedules it.
            </FieldDescription>
            <FieldError>
              {dayInvalid ? `Enter a date as ${datePattern}, or clear it.` : errors.publishAt}
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
              24-hour clock, in the site's time zone, {dates.timeZone}.
            </FieldDescription>
          </Field>
        </>
      ) : null}
    </>
  );

  return (
    <EditorDataProvider initial={data}>
      <form ref={form} action={action} onSubmit={onSubmit} className="entry-editor" noValidate>
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
              <div className="entry-editor__history">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      intent="ghost"
                      aria-label="Undo"
                      aria-keyshortcuts="Control+Z"
                      disabled={!history.canUndo}
                      onClick={history.undo}
                    >
                      <UndoIcon aria-hidden="true" size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      intent="ghost"
                      aria-label="Redo"
                      aria-keyshortcuts="Control+Shift+Z"
                      disabled={!history.canRedo}
                      onClick={history.redo}
                    >
                      <RedoIcon aria-hidden="true" size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
                </Tooltip>
                <EditorShortcuts />
              </div>
              {entry ? <RevisionHistory entryId={entry.id} updatedAt={token} /> : null}
              {entry ? (
                // The site zone's preview (design §7): the last saved version, in a new tab.
                // A plain link: it's another zone, and it sets the draft-mode cookie there.
                <Button asChild intent="ghost">
                  <a href={`/api/preview/${entry.id}`} target="_blank" rel="noopener">
                    <EyeIcon aria-hidden="true" size={16} />
                    Preview
                  </a>
                </Button>
              ) : null}
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
                  ref={saveButton}
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
                  ref={publishButton}
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
                <BlockInserter onAdd={add} pinned={pinned} onPinnedChange={setPinned} />
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
            <div className="entry-editor__canvas-bar">
              <ToggleGroup
                type="single"
                size="sm"
                value={device}
                onValueChange={(next) => next && setDevice(next as Device)}
                aria-label="Show the page at the width of"
              >
                {DEVICES.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value}>
                    <Icon aria-hidden="true" size={16} />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Button
                intent="ghost"
                size="sm"
                aria-keyshortcuts="Control+K"
                onClick={() => setQuickAdd(true)}
              >
                Quick add
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </Button>
            </div>
            <BlockCanvas
              ref={canvas}
              src={canvasSrc}
              label={`The ${noun.one} as visitors will see it`}
              blocks={blocks}
              selectedId={selectedId}
              issueIds={issueIds}
              onSelect={select}
              title={title}
              featuredMediaId={featuredMediaId}
              device={device}
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
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onChange={(props) =>
                    selectedId &&
                    // Typing in one block's fields is one undo step (use-history.ts).
                    setBlocks((now) => updateProps(now, selectedId, props), {
                      merge: `props:${selectedId}`,
                    })
                  }
                  onMove={moveSelected}
                  onDuplicate={duplicateSelected}
                  onRemove={removeSelected}
                />
              </TabsContent>
              {/* Mounted while hidden: its fields go with every save. */}
              <TabsContent
                value="entry"
                forceMount
                hidden={settingsTab !== "entry"}
                className="entry-editor__tab"
              >
                <PageSummary title={title} blocks={blocks} selectedId={selectedId} onJump={jump} />
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
      <QuickAdd
        open={quickAdd}
        onOpenChange={setQuickAdd}
        pinned={pinned}
        onAdd={add}
        selected={
          selected
            ? {
                label: getBlockDefinition(selected.type)?.label ?? selected.type,
                canMoveUp,
                canMoveDown,
                onMove: moveSelected,
                onDuplicate: duplicateSelected,
                onRemove: removeSelected,
              }
            : null
        }
      />
    </EditorDataProvider>
  );
}
