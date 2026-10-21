// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { UploadIcon } from "@nuvui/icons";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MediaUploader } from "@/components/media-uploader/media-uploader";

// The Media screen's Upload button and the dialog it opens.
export function MediaUploadDialog({ maxBytes }: { maxBytes: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UploadIcon size={16} />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>They go to the media storage set in Settings.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <MediaUploader
            maxBytes={maxBytes}
            onUploaded={(media) => {
              toast(
                media.length === 1
                  ? `${media[0]?.filename} uploaded`
                  : `${media.length} files uploaded`,
                {
                  intent: "success",
                },
              );
              router.refresh();
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
