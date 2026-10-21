"use client";

import type { BlockList, EntryKind } from "@sitebuilder/schema";
import { useEffect, useRef, useState } from "react";
import { autosaveDraft } from "@/actions/entry-editor";
import type { BlockIssue } from "@/components/entry-editor/editor-state";

// The editor's autosave (design §8, decisions #56): a few seconds after the last change to a
// draft's title or blocks, they're saved without a revision. Published and scheduled entries
// are never autosaved; they show "Unsaved changes" until Update.

const DELAY_MS = 3000;

export type SaveStatus =
  | { state: "clean" }
  | { state: "dirty" }
  | { state: "saving" }
  | { state: "saved"; at: string }
  | { state: "problem"; message: string };

export const snapshotOf = (title: string, blocks: BlockList): string =>
  JSON.stringify({ title, blocks });

export function useAutosave({
  enabled,
  type,
  entryId,
  token,
  title,
  blocks,
  savedSnapshot,
  onSaved,
  onIssues,
}: {
  // A draft, or an entry not created yet.
  enabled: boolean;
  type: EntryKind;
  entryId: string;
  // The entry's updatedAt, the conflict check's token.
  token: string;
  title: string;
  blocks: BlockList;
  // What the server last stored: an explicit save or an autosave.
  savedSnapshot: string;
  onSaved: (saved: { id: string; path: string; updatedAt: string; snapshot: string }) => void;
  onIssues: (issues: BlockIssue[]) => void;
}): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ state: "clean" });
  const snapshot = snapshotOf(title, blocks);
  const dirty = snapshot !== savedSnapshot;
  // The latest values for the timer, without restarting it on every callback change.
  const latest = useRef({ type, entryId, token, title, blocks, onSaved, onIssues });
  latest.current = { type, entryId, token, title, blocks, onSaved, onIssues };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `snapshot` restarts the timer on every change; that restart is the debounce.
  useEffect(() => {
    if (!dirty) {
      setStatus((now) => (now.state === "saved" ? now : { state: "clean" }));
      return;
    }
    setStatus((now) => (now.state === "problem" ? now : { state: "dirty" }));
    if (!enabled || title.trim() === "") return;

    const timer = setTimeout(async () => {
      const sent = latest.current;
      const sentSnapshot = snapshotOf(sent.title, sent.blocks);
      setStatus({ state: "saving" });
      const result = await autosaveDraft({
        id: sent.entryId,
        type: sent.type,
        updatedAt: sent.token,
        title: sent.title,
        content: sent.blocks,
      });
      if (result.ok) {
        sent.onSaved({
          id: result.id,
          path: result.path,
          updatedAt: result.updatedAt,
          snapshot: sentSnapshot,
        });
        sent.onIssues([]);
        setStatus({
          state: "saved",
          at: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
            new Date(),
          ),
        });
        return;
      }
      if (result.blockIssues) sent.onIssues(result.blockIssues);
      setStatus({ state: "problem", message: result.error });
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, enabled, snapshot, title]);

  return status;
}
