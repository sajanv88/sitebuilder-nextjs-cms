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
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  type AltState,
  deleteMediaFile,
  getMediaDetails,
  type MediaDetails,
  type MediaItem,
  saveAlt,
} from "@/actions/media";
import { formatDateTime } from "@/lib/dates";
import { describeType, formatBytes, isImage } from "@/lib/format";
import "./media-details.scss";

// One file's details, in a sheet from the Media screen: a preview, its alt text, what it is,
// where it's used, and Delete, which is refused while it's used (design §4.2).

function UsedIn({ uses }: { uses: MediaUse[] }) {
  if (uses.length === 0) return <p className="media-details__note">Not used anywhere yet.</p>;
  return (
    <ul className="media-details__uses">
      {uses.map((use) => (
        <li key={use.id}>
          <Link href={`/admin/${use.type}s/${use.id}` as Route}>{use.title}</Link>
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

export function MediaDetailsSheet({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<{ error: string; usedIn?: MediaUse[] } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDetails(null);
    setProblem(null);
    if (!id) return;
    let current = true;
    getMediaDetails(id).then((loaded) => {
      if (current) setDetails(loaded);
    });
    return () => {
      current = false;
    };
  }, [id]);

  function remove() {
    if (!id) return;
    startTransition(async () => {
      const result = await deleteMediaFile(id);
      setConfirming(false);
      if (!result.ok) {
        setProblem({ error: result.error, ...(result.usedIn ? { usedIn: result.usedIn } : {}) });
        return;
      }
      toast(result.message, { intent: "success" });
      onClose();
      onChanged();
    });
  }

  const item = details?.ok ? details.item : null;

  return (
    <>
      <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="end" size="md">
          <SheetHeader>
            <SheetTitle>{item?.filename ?? "File"}</SheetTitle>
            <SheetDescription>
              {item ? `${describeType(item.mimeType)}, ${formatBytes(item.sizeBytes)}` : "Loading…"}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="media-details">
            {details === null ? (
              <Skeleton className="media-details__loading" />
            ) : !details.ok ? (
              <Alert intent="danger">
                <AlertDescription>{details.error}</AlertDescription>
              </Alert>
            ) : (
              <>
                {isImage(details.item.mimeType) ? (
                  // biome-ignore lint/performance/noImgElement: served by the site zone at /media/ (decisions #58).
                  <img
                    className="media-details__preview"
                    src={details.item.url}
                    alt={details.item.alt ?? ""}
                  />
                ) : null}

                {details.canEdit && isImage(details.item.mimeType) ? (
                  <AltForm key={details.item.id} item={details.item} onSaved={onChanged} />
                ) : null}

                <dl className="media-details__facts">
                  <div>
                    <dt>Dimensions</dt>
                    <dd>
                      {details.item.width && details.item.height
                        ? `${details.item.width} × ${details.item.height} pixels`
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Uploaded</dt>
                    <dd>
                      {formatDateTime(new Date(details.item.createdAt))} by{" "}
                      {details.item.uploadedBy}
                    </dd>
                  </div>
                  <div>
                    <dt>Stored</dt>
                    <dd>
                      {details.item.storage === "s3" ? "In S3 storage" : "On the server's disk"}
                    </dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd className="media-details__url">{details.item.url}</dd>
                  </div>
                </dl>

                <section className="media-details__section" aria-labelledby="media-used-in">
                  <h3 id="media-used-in" className="media-details__heading">
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
                  <div>
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
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Delete {item?.filename ?? "this file"}?</AlertDialogTitle>
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
    </>
  );
}
