// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the media library loads.
export default function Loading() {
  return <ScreenSkeleton title="Media" kind="media" width="wide" />;
}
