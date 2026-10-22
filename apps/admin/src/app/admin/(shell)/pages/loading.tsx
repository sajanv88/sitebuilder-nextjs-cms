// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the pages load.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Pages"
      description="The site's pages, each at its own address. A page can sit under another, as /about/team does."
      kind="list"
    />
  );
}
