// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { PageSkeleton } from "@/components/page-skeleton/page-skeleton";

// Shown while the home page loads, when it isn't cached yet. It's a page more often than the
// latest posts, which only show until one is chosen in Settings → Reading.
export default function Loading() {
  return <PageSkeleton kind="entry" label="Loading the page" />;
}
