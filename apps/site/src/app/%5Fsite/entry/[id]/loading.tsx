// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { PageSkeleton } from "@/components/page-skeleton/page-skeleton";

// Shown while a page or post loads, when it isn't cached yet.
export default function Loading() {
  return <PageSkeleton kind="entry" label="Loading the page" />;
}
