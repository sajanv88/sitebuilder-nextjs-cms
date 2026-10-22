// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { EditorSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once when an editor is opened, while the post and what its blocks use load.
export default function Loading() {
  return <EditorSkeleton noun="post" />;
}
