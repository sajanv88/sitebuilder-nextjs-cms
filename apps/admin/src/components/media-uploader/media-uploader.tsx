// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { CheckCircleIcon, XCircleIcon } from "@nuvui/icons";
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  type FileRejection,
  FileUpload,
  Progress,
} from "@nuvui/react";
import { useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import "./media-uploader.scss";

// Picks files with nuvui's FileUpload and sends each to POST /admin/api/media, one at a time,
// with its progress. Nothing goes until Upload is pressed, and Cancel stops it (FileUpload's
// "don't start an upload the moment a file is chosen without a way to cancel it").
// XMLHttpRequest rather than fetch: only it reports how far an upload has got.

export interface UploadedMedia {
  id: string;
  filename: string;
  mimeType: string;
  kind: "image" | "video" | "document";
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

type Status =
  | { state: "waiting" }
  | { state: "sending"; percent: number }
  | { state: "done" }
  | { state: "failed"; error: string };

interface Queued {
  file: File;
  status: Status;
}

// The browser's picker shows these; the server checks the bytes whatever they're called.
const ACCEPT_ALL = ".jpg,.jpeg,.png,.gif,.webp,.avif,.mp4,.webm,.pdf";
const ACCEPT_IMAGES = ".jpg,.jpeg,.png,.gif,.webp,.avif";
const ACCEPT_VIDEOS = ".mp4,.webm";

function send(
  file: File,
  onProgress: (percent: number) => void,
  controller: { abort?: () => void },
): Promise<{ ok: true; media: UploadedMedia } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    controller.abort = () => request.abort();
    const body = new FormData();
    body.append("file", file);
    request.open("POST", "/admin/api/media");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const answer = request.response as { ok?: boolean; error?: string; media?: UploadedMedia };
      if (request.status === 201 && answer?.media) resolve({ ok: true, media: answer.media });
      else resolve({ ok: false, error: answer?.error ?? `The upload failed (${request.status}).` });
    };
    request.onerror = () => resolve({ ok: false, error: "The connection was lost." });
    request.onabort = () => resolve({ ok: false, error: "Cancelled." });
    request.send(body);
  });
}

export function MediaUploader({
  maxBytes,
  accept = "any",
  onUploaded,
}: {
  maxBytes: number;
  accept?: "any" | "image" | "video";
  // Called once a round of uploads ends, with the files that went through.
  onUploaded: (media: UploadedMedia[]) => void;
}) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [rejected, setRejected] = useState<FileRejection[]>([]);
  const [running, setRunning] = useState(false);
  // A new FileUpload after each round, so its list empties.
  const [round, setRound] = useState(0);
  const current = useRef<{ abort?: () => void; cancelled: boolean }>({ cancelled: false });

  const setStatus = (index: number, status: Status) =>
    setQueue((now) => now.map((item, i) => (i === index ? { ...item, status } : item)));

  async function upload() {
    setRunning(true);
    current.current = { cancelled: false };
    const done: UploadedMedia[] = [];
    for (const [index, item] of queue.entries()) {
      if (item.status.state === "done") continue;
      if (current.current.cancelled) {
        setStatus(index, { state: "failed", error: "Cancelled." });
        continue;
      }
      setStatus(index, { state: "sending", percent: 0 });
      const result = await send(
        item.file,
        (percent) => setStatus(index, { state: "sending", percent }),
        current.current,
      );
      if (result.ok) {
        done.push(result.media);
        setStatus(index, { state: "done" });
      } else {
        setStatus(index, { state: "failed", error: result.error });
      }
    }
    setRunning(false);
    setRound((n) => n + 1);
    if (done.length > 0) onUploaded(done);
  }

  function cancel() {
    current.current.cancelled = true;
    current.current.abort?.();
  }

  const waiting = queue.filter((item) => item.status.state !== "done").length;
  const limit = formatBytes(maxBytes);

  return (
    <div className="media-uploader">
      <Field>
        <FieldLabel>Files</FieldLabel>
        <FieldControl>
          <FileUpload
            key={round}
            multiple
            accept={
              accept === "image" ? ACCEPT_IMAGES : accept === "video" ? ACCEPT_VIDEOS : ACCEPT_ALL
            }
            maxSize={maxBytes}
            disabled={running}
            showList={false}
            onReject={setRejected}
            onFilesChange={(files) => {
              setRejected([]);
              setQueue((now) => [
                ...now.filter((item) => item.status.state === "done"),
                ...files.map((file) => ({ file, status: { state: "waiting" } as const })),
              ]);
            }}
          >
            Drop files here, or choose them from your device
          </FileUpload>
        </FieldControl>
        <FieldDescription>
          {accept === "image"
            ? `JPEG, PNG, GIF, WebP or AVIF, up to ${limit} each.`
            : accept === "video"
              ? `MP4 or WebM, up to ${limit} each.`
              : `Images (JPEG, PNG, GIF, WebP, AVIF), videos (MP4, WebM) and PDFs, up to ${limit} each.`}
        </FieldDescription>
        <FieldError>
          {rejected.length > 0
            ? rejected
                .map(({ file, reason }) =>
                  reason === "size"
                    ? `${file.name} is over ${limit}.`
                    : reason === "type"
                      ? `${file.name} isn't a kind of file that can be uploaded.`
                      : `${file.name} is one too many.`,
                )
                .join(" ")
            : null}
        </FieldError>
      </Field>

      {queue.length > 0 ? (
        <ul className="media-uploader__list" aria-label="Files to upload">
          {queue.map((item, index) => (
            // Files have no ids until they're uploaded; the list is rebuilt, not reordered.
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <li key={index} className="media-uploader__item">
              <span className="media-uploader__name">{item.file.name}</span>
              <span className="media-uploader__size">{formatBytes(item.file.size)}</span>
              <span className="media-uploader__status">
                {item.status.state === "sending" ? (
                  <Progress
                    size="sm"
                    value={item.status.percent}
                    aria-label={`Uploading ${item.file.name}`}
                  />
                ) : item.status.state === "done" ? (
                  <span className="media-uploader__done">
                    <CheckCircleIcon aria-hidden="true" size={16} />
                    Uploaded
                  </span>
                ) : item.status.state === "failed" ? (
                  <span className="media-uploader__failed" role="alert">
                    <XCircleIcon aria-hidden="true" size={16} />
                    {item.status.error}
                  </span>
                ) : (
                  "Waiting"
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="media-uploader__actions">
        {running ? (
          <Button intent="secondary" onClick={cancel}>
            Cancel
          </Button>
        ) : (
          <Button onClick={upload} disabled={waiting === 0}>
            {waiting > 1 ? `Upload ${waiting} files` : "Upload"}
          </Button>
        )}
        {!running && queue.length > 0 ? (
          <Button intent="ghost" onClick={() => setQueue([])}>
            Clear the list
          </Button>
        ) : null}
      </div>
    </div>
  );
}
