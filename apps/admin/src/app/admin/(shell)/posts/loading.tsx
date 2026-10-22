// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the posts load.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Posts"
      description="News and articles, listed newest first on the blog. Drafts stay here until they're published."
      kind="list"
    />
  );
}
