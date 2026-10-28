// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { Alert, AlertDescription, AlertTitle, Button, Progress } from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { moveMediaFiles } from "@/actions/media-storage";
import "./media-move.scss";

// Settings → Media storage: files uploaded before a change of storage, moved to where uploads go
// now (decisions #150), a few at a time with a bar showing how far it's got. Addresses don't
// change, so pages need nothing. It can be stopped, and started again later.

export function MediaMove({
  elsewhere,
  from,
  to,
}: {
  // Files not where uploads go now.
  elsewhere: number;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [left, setLeft] = useState(elsewhere);
  const [failed, setFailed] = useState<{ filename: string; error: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const total = done + left;

  async function run() {
    setRunning(true);
    setError(null);
    stop.current = false;
    const skipped: string[] = [];
    const problems: { filename: string; error: string }[] = [];
    let moved = 0;
    for (;;) {
      if (stop.current) break;
      const result = await moveMediaFiles(skipped);
      if (!result.ok) {
        setError(result.error);
        break;
      }
      moved += result.moved;
      setDone(moved);
      setLeft(result.left);
      problems.push(...result.failed);
      skipped.push(...result.failed.map((f) => f.id));
      setFailed([...problems]);
      // Nothing moved this round: what's left failed, so stop rather than try it forever.
      // Done, or nothing could move this round (what's left failed and is skipped).
      if (result.left <= skipped.length || result.moved === 0) break;
    }
    setRunning(false);
    router.refresh();
  }

  if (elsewhere === 0 && done === 0) return null;
  return (
    <div className="media-move">
      <Alert intent={left === 0 ? "success" : "info"}>
        <AlertTitle>
          {left === 0
            ? "Every file is in one place"
            : `${left} ${left === 1 ? "file is" : "files are"} still ${from}`}
        </AlertTitle>
        <AlertDescription>
          {left === 0
            ? `All files are ${to} now.`
            : `They're served from there and keep working. Move them ${to} to empty the old storage; their addresses stay the same.`}
        </AlertDescription>
      </Alert>
      {running || done > 0 ? (
        <div className="media-move__progress">
          <p id="media-move-label" className="media-move__count">{`Moved ${done} of ${total}`}</p>
          <Progress
            aria-labelledby="media-move-label"
            value={done}
            max={Math.max(total, 1)}
            getValueLabel={(value, max) => `${value} of ${max} files moved`}
          />
        </div>
      ) : null}
      {failed.length > 0 ? (
        <Alert intent="warning" role="alert">
          <AlertDescription>
            {`${failed.length} ${failed.length === 1 ? "file" : "files"} stayed where ${failed.length === 1 ? "it was" : "they were"}: `}
            {failed
              .slice(0, 5)
              .map((f) => `${f.filename} (${f.error})`)
              .join(", ")}
            {failed.length > 5 ? ", and more." : "."}
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {left > 0 ? (
        running ? (
          <Button intent="secondary" onClick={() => (stop.current = true)}>
            Stop after these
          </Button>
        ) : (
          <Button intent="secondary" onClick={run} className="media-move__start">
            {done > 0 ? "Move the rest" : `Move ${left} ${left === 1 ? "file" : "files"} ${to}`}
          </Button>
        )
      ) : null}
    </div>
  );
}
