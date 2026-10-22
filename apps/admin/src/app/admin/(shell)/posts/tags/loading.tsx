// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the tags load.
export default function Loading() {
  return <ScreenSkeleton title="Tags" kind="panes" />;
}
