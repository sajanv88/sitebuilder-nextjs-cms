// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
  toast,
} from "@nuvui/react";
import type { MediaUse } from "@sitebuilder/db";
import type { Route } from "next";
import { useActionState, useEffect, useId, useState, useTransition } from "react";
import {
  type AltState,
  deleteMediaFile,
  getMediaDetails,
  type MediaDetails,
  type MediaItem,
  makeShareLink,
  saveAlt,
  setFilePrivate,
} from "@/actions/media";
import { useFormatDateTime } from "@/components/date-settings/date-settings";
import { TextLink } from "@/components/text-link/text-link";
import { describeType, formatBytes, isImage } from "@/lib/format";
import { SHARE_DURATIONS } from "@/lib/share";
import "./media-details.scss";

// One file's details: a preview, its alt text, who can see it, what it is, where it's used,
// and Delete, which is refused while it's used (design §4.2).

function UsedIn({ uses }: { uses: MediaUse[] }) {
  if (uses.length === 0) return <p className="media-details__note">Not used anywhere yet.</p>;
  return (
    <ul className="media-details__uses">
      {uses.map((use) => (
        <li key={use.id}>
          <TextLink href={`/admin/${use.type}s/${use.id}` as Route}>{use.title}</TextLink>
          {use.inTrash ? (
            <Badge variant="outline" intent="warning">
              In the trash
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AltForm({ item, onSaved }: { item: MediaItem; onSaved: () => void }) {
  const [state, action, saving] = useActionState<AltState, FormData>(saveAlt, {
    result: "idle",
    alt: item.alt ?? "",
  });
  useEffect(() => {
    if (state.result === "saved" && state.at) {
      toast(state.message ?? "Saved.", { intent: "success", id: `alt-${state.at}` });
      onSaved();
    }
  }, [state.result, state.at, state.message, onSaved]);
  return (
    <form action={action} className="media-details__alt" noValidate>
      <input type="hidden" name="id" value={item.id} />
      <Field>
        <FieldLabel>Alt text</FieldLabel>
        <FieldControl>
          <Input name="alt" defaultValue={state.alt} maxLength={200} />
        </FieldControl>
        <FieldDescription>
          What the picture shows, for people who can't see it. Blocks use it unless they set their
          own. Leave it empty for a picture that's only decoration.
        </FieldDescription>
        <FieldError>
          {state.result === "invalid" || state.result === "failed" ? state.message : null}
        </FieldError>
      </Field>
      <div>
        <Button type="submit" intent="secondary" disabled={saving} aria-busy={saving}>
          Save alt text
        </Button>
      </div>
    </form>
  );
}

// Private or public, and share links for a private file (decisions #149). The switch applies at
// once. A link is made on the server, signed, and shown here to copy; it isn't kept anywhere.
function Privacy({
  item,
  used,
  onChanged,
}: {
  item: MediaItem;
  // A page or post uses it: it can't be made private.
  used: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const formatDateTime = useFormatDateTime();
  const [isPrivate, setIsPrivate] = useState(item.private);
  const [seconds, setSeconds] = useState<number>(SHARE_DURATIONS[1].seconds);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setProblem(null);
    setIsPrivate(next);
    startTransition(async () => {
      const result = await setFilePrivate({ id: item.id, private: next });
      if (!result.ok) {
        setIsPrivate(!next);
        setProblem(result.error);
        return;
      }
      setLink(null);
      toast(next ? "The file is private." : "The file is public again.", { intent: "success" });
      onChanged();
    });
  }

  function share() {
    setProblem(null);
    startTransition(async () => {
      const result = await makeShareLink({ id: item.id, seconds });
      if (result.ok) setLink({ url: result.url, expires: result.expires });
      else setProblem(result.error);
    });
  }

  return (
    <section className="media-details__section" aria-labelledby={`${id}-who`}>
      <h3 id={`${id}-who`} className="media-details__heading">
        Who can see it
      </h3>
      <div className="media-details__switch">
        <Switch
          id={`${id}-private`}
          checked={isPrivate}
          disabled={pending || (used && !isPrivate)}
          onCheckedChange={change}
          aria-describedby={`${id}-private-about`}
        />
        <label htmlFor={`${id}-private`}>Private</label>
      </div>
      <p id={`${id}-private-about`} className="media-details__note">
        {used && !isPrivate
          ? "A page or post uses it, so it stays public. Take it off them to make it private."
          : isPrivate
            ? "Only people signed in here can open it, and anyone with a share link while it lasts."
            : "Anyone with its address can open it, as with every file on a website."}
      </p>
      {isPrivate ? (
        <div className="media-details__share">
          <NativeSelect
            aria-label="How long the link works"
            value={String(seconds)}
            onChange={(event) => setSeconds(Number(event.currentTarget.value))}
          >
            {SHARE_DURATIONS.map((duration) => (
              <option key={duration.seconds} value={duration.seconds}>
                {duration.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            intent="secondary"
            size="sm"
            onClick={share}
            disabled={pending}
            aria-busy={pending}
          >
            Make a share link
          </Button>
        </div>
      ) : null}
      {link ? (
        <Field>
          <FieldLabel>Share link</FieldLabel>
          <FieldControl>
            <Input readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} />
          </FieldControl>
          <FieldDescription>
            {`Works until ${formatDateTime(new Date(link.expires))}. Anyone with it can open the file until then; it can't be taken back sooner.`}
          </FieldDescription>
          <div>
            <Button
              intent="ghost"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(link.url)
                  .then(() => toast("Copied.", { intent: "success" }))
                  .catch(() => toast("Select the link and copy it.", { intent: "warning" }))
              }
            >
              Copy
            </Button>
          </div>
        </Field>
      ) : null}
      {problem ? (
        <Alert intent="warning" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

// One file's details: in the Media screen's side panel on a wide screen, in a sheet on a
// narrow one (MediaDetailsSheet). The file is loaded by id when it changes.
export function MediaFileDetails({
  id,
  headingId,
  onChanged,
  onDeleted,
}: {
  id: string;
  // The id the file's name gets, for whatever it's in to be named by.
  headingId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const formatDateTime = useFormatDateTime();
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<{ error: string; usedIn?: MediaUse[] } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDetails(null);
    setProblem(null);
    let current = true;
    getMediaDetails(id).then((loaded) => {
      if (current) setDetails(loaded);
    });
    return () => {
      current = false;
    };
  }, [id]);

  function remove() {
    startTransition(async () => {
      const result = await deleteMediaFile(id);
      setConfirming(false);
      if (!result.ok) {
        setProblem({ error: result.error, ...(result.usedIn ? { usedIn: result.usedIn } : {}) });
        return;
      }
      toast(result.message, { intent: "success" });
      onDeleted();
    });
  }

  if (details === null) {
    return (
      <div className="media-details">
        <h2 id={headingId} className="media-details__name">
          Loading…
        </h2>
        <Skeleton className="media-details__loading" />
      </div>
    );
  }
  if (!details.ok) {
    return (
      <div className="media-details">
        <h2 id={headingId} className="media-details__name">
          File
        </h2>
        <Alert intent="danger">
          <AlertDescription>{details.error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  const { item } = details;

  return (
    <div className="media-details">
      <div className="media-details__head">
        <h2 id={headingId} className="media-details__name">
          {item.filename}
        </h2>
        <Badge variant="outline">{describeType(item.mimeType)}</Badge>
        {item.private ? <Badge intent="warning">Private</Badge> : null}
      </div>
      <p className="media-details__note">
        {formatBytes(item.sizeBytes)}
        {item.width && item.height ? `, ${item.width} × ${item.height} pixels` : null}
      </p>

      {isImage(item.mimeType) ? (
        // biome-ignore lint/performance/noImgElement: served by the site zone at /media/ (decisions #58).
        <img className="media-details__preview" src={item.url} alt={item.alt ?? ""} />
      ) : null}

      <div className="media-details__actions">
        <Button asChild intent="secondary" size="sm">
          <a href={item.url} target="_blank" rel="noopener">
            Open the file
          </a>
        </Button>
      </div>

      {details.canEdit && isImage(item.mimeType) ? (
        <AltForm key={item.id} item={item} onSaved={onChanged} />
      ) : null}

      {details.canEdit ? (
        <Privacy key={item.id} item={item} used={details.usedIn.length > 0} onChanged={onChanged} />
      ) : null}

      <dl className="media-details__facts">
        <div>
          <dt>Uploaded</dt>
          <dd>
            {formatDateTime(new Date(item.createdAt))} by {item.uploadedBy}
          </dd>
        </div>
        <div>
          <dt>Stored</dt>
          <dd>{item.storage === "s3" ? "In S3 storage" : "On the server's disk"}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd className="media-details__url">{item.url}</dd>
        </div>
      </dl>

      <section className="media-details__section" aria-labelledby={`${headingId}-used`}>
        <h3 id={`${headingId}-used`} className="media-details__heading">
          Used in
        </h3>
        <UsedIn uses={details.usedIn} />
      </section>

      {problem ? (
        <Alert intent="warning" role="alert">
          <AlertDescription>{problem.error}</AlertDescription>
        </Alert>
      ) : null}

      {details.canDelete ? (
        <div className="media-details__danger">
          <Button
            intent="danger"
            disabled={pending || details.usedIn.length > 0}
            onClick={() => setConfirming(true)}
          >
            Delete file
          </Button>
          {details.usedIn.length > 0 ? (
            <p className="media-details__note">It can be deleted once nothing uses it.</p>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Delete {item.filename}?</AlertDialogTitle>
          <AlertDialogDescription>
            It's removed from the library and from storage. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The same details in a sheet, for a screen too narrow for the panel beside the files.
export function MediaDetailsSheet({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="end" size="md">
        <SheetHeader>
          <SheetTitle>File details</SheetTitle>
          <SheetDescription>What it is, where it's used, and its alt text.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {id ? (
            <MediaFileDetails
              id={id}
              headingId="media-sheet-file"
              onChanged={onChanged}
              onDeleted={() => {
                onClose();
                onChanged();
              }}
            />
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
