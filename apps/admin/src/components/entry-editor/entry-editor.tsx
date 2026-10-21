"use client";

import { ColumnsIcon, TrashIcon } from "@nuvui/icons";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
  toast,
} from "@nuvui/react";
import { ENTRY_LIMITS, type EntryKind } from "@sitebuilder/schema";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { saveEntry } from "@/actions/entry-editor";
import { trashEntries } from "@/actions/entry-list";
import { RevisionHistory } from "@/components/revision-history/revision-history";
import { TermPicker } from "@/components/term-picker/term-picker";
import { formatDateTime } from "@/lib/dates";
import type { EditorEntry, EditorState, EditorValues } from "./editor-state";
import "./entry-editor.scss";

// The editor for a post or a page (design §8). Phase 2 edits everything but the body: blocks
// arrive in phase 3, and the area for them is shown empty. The page-header block gives the
// top: where you are, the title and status, and the actions.

export interface EditorOptions {
  // Pages that can be the parent (pages only).
  parents: { id: string; title: string; path: string }[] | null;
  // Users the author can be changed to (posts, for someone allowed post.update).
  authors: { id: string; name: string }[] | null;
  // Terms to pick from (posts, for someone allowed term.assign).
  categories: { id: string; name: string }[] | null;
  tags: { id: string; name: string }[] | null;
}

const NOUNS = {
  post: { one: "post", many: "Posts", list: "/admin/posts" },
  page: { one: "page", many: "Pages", list: "/admin/pages" },
} as const satisfies Record<EntryKind, { one: string; many: string; list: Route }>;

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

// "2026-10-21T16:05" in the browser's time zone, for a datetime-local field.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

// A field with a limit, and how much of it is used.
function Counted({
  name,
  label,
  limit,
  defaultValue,
  multiline,
  error,
}: {
  name: keyof EditorValues;
  label: string;
  limit: number;
  defaultValue: string;
  multiline?: boolean;
  error?: string | undefined;
}) {
  const [length, setLength] = useState(defaultValue.length);
  const over = length > limit;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl>
        {multiline ? (
          <Textarea
            name={name}
            rows={3}
            autoResize
            defaultValue={defaultValue}
            onInput={(event) => setLength(event.currentTarget.value.length)}
          />
        ) : (
          <Input
            name={name}
            defaultValue={defaultValue}
            onInput={(event) => setLength(event.currentTarget.value.length)}
          />
        )}
      </FieldControl>
      <FieldDescription>
        {length} of {limit} characters
      </FieldDescription>
      <FieldError>{error ?? (over ? `Use at most ${limit} characters.` : undefined)}</FieldError>
    </Field>
  );
}

export function EntryEditor({
  type,
  initial,
  options,
  allowed,
  created,
}: {
  type: EntryKind;
  initial: Pick<EditorState, "values" | "entry">;
  options: EditorOptions;
  allowed: { publish: boolean; trash: boolean; createTerms: boolean };
  created: boolean;
}) {
  const router = useRouter();
  const [state, action, saving] = useActionState(saveEntry, { result: "idle", ...initial });
  const [trashing, startTrash] = useTransition();
  const inBrowser = useInBrowser();
  const noun = NOUNS[type];
  const { values, entry } = state;
  const errors = state.errors ?? {};
  const busy = saving || trashing;

  // The publish date as typed in the field; null until it's touched.
  const [publishLocal, setPublishLocal] = useState<string | null>(null);
  const scheduledLocal =
    inBrowser && entry?.status === "scheduled" && entry.publishedAt
      ? toLocalInput(entry.publishedAt)
      : "";
  const local = publishLocal ?? scheduledLocal;
  const publishAt = local && !Number.isNaN(Date.parse(local)) ? new Date(local).toISOString() : "";
  const future = publishAt !== "" && Date.parse(publishAt) > Date.now();
  const zone = inBrowser ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  // One toast per save, and one when the editor opens on something just created. Each has an
  // id, so an effect that runs twice (React does in development) shows it once.
  useEffect(() => {
    if (state.result === "saved" && state.message && state.savedAt) {
      toast(state.message, { intent: "success", id: `saved-${state.savedAt}` });
    }
  }, [state.result, state.message, state.savedAt]);
  useEffect(() => {
    if (!created || !entry) return;
    toast(`${noun.one === "post" ? "Post" : "Page"} created`, {
      intent: "success",
      id: `created-${entry.id}`,
    });
    // Drop ?created=1, so a reload doesn't say it again.
    router.replace(`${noun.list}/${entry.id}` as Route, { scroll: false });
  }, [created, entry, noun.one, noun.list, router]);

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
      toast(`Moved to the trash`, { intent: "success" });
      router.push(noun.list);
    });
  }

  const live = entry?.status === "published" || entry?.status === "scheduled";
  const publishLabel = future ? "Schedule" : entry?.status === "published" ? "Update" : "Publish";

  return (
    <form action={action} className="entry-editor" noValidate>
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="updatedAt" value={entry?.updatedAt ?? ""} />
      <input type="hidden" name="publishAt" value={publishAt} />

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
              <BreadcrumbPage>{entry ? values.title : `New ${noun.one}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="entry-editor__row">
          <div className="entry-editor__heading">
            <h1 className="entry-editor__title">{entry ? values.title : `New ${noun.one}`}</h1>
            {entry ? (
              <Badge intent={STATUS[entry.status].intent} variant="outline">
                {STATUS[entry.status].label}
              </Badge>
            ) : null}
          </div>
          <div className="entry-editor__actions">
            {entry ? <RevisionHistory entryId={entry.id} updatedAt={entry.updatedAt} /> : null}
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

      <div className="entry-editor__body">
        <div className="entry-editor__main">
          <Field required>
            <FieldLabel>Title</FieldLabel>
            <FieldControl>
              <Input name="title" defaultValue={values.title} maxLength={ENTRY_LIMITS.title} />
            </FieldControl>
            <FieldError>{errors.title}</FieldError>
          </Field>
          <Counted
            name="excerpt"
            label="Excerpt"
            limit={ENTRY_LIMITS.excerpt}
            defaultValue={values.excerpt}
            multiline
            error={errors.excerpt}
          />
          <Empty>
            <EmptyMedia>
              <ColumnsIcon size={24} />
            </EmptyMedia>
            <EmptyTitle asChild>
              <h2>Content blocks come next</h2>
            </EmptyTitle>
            <EmptyDescription>
              Headings, text, images and the rest are added here in the next release. Saving now
              keeps the {noun.one}'s details and an empty body.
            </EmptyDescription>
          </Empty>
        </div>

        <aside
          className="entry-editor__side"
          aria-label={`${noun.one === "post" ? "Post" : "Page"} settings`}
        >
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Publishing</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="entry-editor__card">
              <p className="entry-editor__note">{statusLine(entry)}</p>
              {allowed.publish ? (
                <Field>
                  <FieldLabel>Publish on</FieldLabel>
                  <FieldControl>
                    <Input
                      type="datetime-local"
                      value={local}
                      onChange={(event) => setPublishLocal(event.currentTarget.value)}
                    />
                  </FieldControl>
                  <FieldDescription>
                    Empty publishes now. A later time schedules it.
                    {zone ? ` Times are in your time zone, ${zone}.` : null}
                  </FieldDescription>
                  <FieldError>{errors.publishAt}</FieldError>
                </Field>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Address</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="entry-editor__card">
              <Field>
                <FieldLabel>Slug</FieldLabel>
                <FieldControl>
                  <Input name="slug" defaultValue={values.slug} spellCheck={false} />
                </FieldControl>
                <FieldDescription>
                  {entry ? `Now at ${entry.path}. ` : null}
                  Lowercase letters, digits and hyphens. Empty makes one from the title.
                </FieldDescription>
                <FieldError>{errors.slug}</FieldError>
              </Field>
              {options.parents ? (
                <Field>
                  <FieldLabel>Parent page</FieldLabel>
                  <FieldControl>
                    <NativeSelect name="parentId" defaultValue={values.parentId}>
                      <option value="">None (top level)</option>
                      {options.parents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.title} ({parent.path})
                        </option>
                      ))}
                    </NativeSelect>
                  </FieldControl>
                  <FieldError>{errors.parentId}</FieldError>
                </Field>
              ) : null}
            </CardContent>
          </Card>

          {options.authors ? (
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>Author</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="entry-editor__card">
                <Field>
                  <FieldLabel>Written by</FieldLabel>
                  <FieldControl>
                    <NativeSelect name="authorId" defaultValue={values.authorId}>
                      {options.authors.map((author) => (
                        <option key={author.id} value={author.id}>
                          {author.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FieldControl>
                  <FieldError>{errors.authorId}</FieldError>
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {options.categories && options.tags ? (
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>Categories and tags</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="entry-editor__card">
                <TermPicker
                  taxonomy="category"
                  name="categoryIds"
                  label="Categories"
                  options={options.categories}
                  defaultPicked={values.categoryIds}
                  canCreate={allowed.createTerms}
                  error={errors.categoryIds}
                />
                <TermPicker
                  taxonomy="tag"
                  name="tagIds"
                  label="Tags"
                  options={options.tags}
                  defaultPicked={values.tagIds}
                  canCreate={allowed.createTerms}
                  error={errors.tagIds}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Search engines</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="entry-editor__card">
              <Counted
                name="seoTitle"
                label="Title for search results"
                limit={ENTRY_LIMITS.seoTitle}
                defaultValue={values.seoTitle}
                error={errors.seoTitle}
              />
              <Counted
                name="seoDescription"
                label="Description for search results"
                limit={ENTRY_LIMITS.seoDescription}
                defaultValue={values.seoDescription}
                multiline
                error={errors.seoDescription}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
