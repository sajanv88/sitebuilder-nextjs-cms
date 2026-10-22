// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the templates load: a grid of cards, as the media screen's tiles.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Templates"
      description="Start the site from a ready-made design: its look, starter pages to edit, and its menus. Nothing you've written is changed or removed."
      kind="media"
      width="wide"
    />
  );
}
