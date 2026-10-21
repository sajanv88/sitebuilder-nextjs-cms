"use client";

import { ClockIcon } from "@nuvui/icons";
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
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { loadRevisions, type RevisionItem, restoreEntryRevision } from "@/actions/entry-editor";
import { formatDateTime } from "@/lib/dates";
import "./revision-history.scss";

type Loaded =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; items: RevisionItem[] };

// An entry's revisions in a sheet, newest first (design §4.1). Restoring copies a revision's
// title and content back, as a new revision; the editor then reloads with what was restored.
export function RevisionHistory({ entryId, updatedAt }: { entryId: string; updatedAt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [restoring, setRestoring] = useState<RevisionItem | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  function load() {
    setLoaded({ state: "loading" });
    startTransition(async () => {
      const result = await loadRevisions(entryId);
      setLoaded(
        result.ok
          ? { state: "ready", items: result.items }
          : { state: "failed", error: result.error },
      );
    });
  }

  function restore(item: RevisionItem) {
    startTransition(async () => {
      const result = await restoreEntryRevision({ entryId, revisionId: item.id, updatedAt });
      if (!result.ok) {
        toast(result.error, { intent: "danger" });
        return;
      }
      setOpen(false);
      toast("Revision restored", {
        intent: "success",
        description: `From ${formatDateTime(new Date(item.createdAt))}.`,
      });
      // The editor is keyed on the entry's updatedAt: fresh data makes it start again from what
      // was restored.
      router.refresh();
    });
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) load();
        }}
      >
        <SheetTrigger asChild>
          <Button ref={trigger} intent="ghost">
            <ClockIcon size={16} />
            History
          </Button>
        </SheetTrigger>
        <SheetContent side="end" size="md">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
            <SheetDescription>
              A revision is kept for every save and every publish, the latest 50.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {loaded.state === "loading" ? (
              <div className="revision-history__list" aria-busy="true">
                <Skeleton className="revision-history__placeholder" />
                <Skeleton className="revision-history__placeholder" />
                <Skeleton className="revision-history__placeholder" />
              </div>
            ) : loaded.state === "failed" ? (
              <Alert intent="danger">
                <AlertDescription>{loaded.error}</AlertDescription>
              </Alert>
            ) : (
              <ol className="revision-history__list">
                {loaded.items.map((item, index) => (
                  <li key={item.id} className="revision-history__item">
                    <div className="revision-history__about">
                      <time className="revision-history__when" dateTime={item.createdAt}>
                        {formatDateTime(new Date(item.createdAt))}
                      </time>
                      <span className="revision-history__who">{item.author}</span>
                      <span className="revision-history__title">{item.title}</span>
                    </div>
                    {index === 0 ? (
                      <span className="revision-history__current">Current</span>
                    ) : (
                      <Button
                        size="sm"
                        intent="secondary"
                        disabled={pending}
                        onClick={() => setRestoring(item)}
                      >
                        Restore
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={restoring !== null}
        onOpenChange={(next) => {
          if (!next) setRestoring(null);
        }}
      >
        <AlertDialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            // The Restore button that opened this is inside a sheet that has closed.
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <AlertDialogTitle>Restore this revision?</AlertDialogTitle>
          <AlertDialogDescription>
            {restoring
              ? `The title and content go back to how they were on ${formatDateTime(new Date(restoring.createdAt))}. What's there now stays in the history.`
              : null}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (restoring) restore(restoring);
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
