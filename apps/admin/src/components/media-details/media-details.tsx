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
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
} from "@nuvui/react";
import type { MediaUse } from "@sitebuilder/db";
import type { Route } from "next";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  type AltState,
  deleteMediaFile,
  getMediaDetails,
  type MediaDetails,
  type MediaItem,
  saveAlt,
} from "@/actions/media";
import { useFormatDateTime } from "@/components/date-settings/date-settings";
import { TextLink } from "@/components/text-link/text-link";
import { describeType, formatBytes, isImage } from "@/lib/format";
import "./media-details.scss";

// One file's details: a preview, its alt text, what it is, where it's used, and Delete, which
// is refused while it's used (design §4.2).

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
