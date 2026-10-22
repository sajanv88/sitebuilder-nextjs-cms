// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the menus load.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Menus"
      description="The links across the top of every page, and in the footer. Links to pages and posts follow them when their address changes."
      kind="panes"
      width="wide"
    />
  );
}
