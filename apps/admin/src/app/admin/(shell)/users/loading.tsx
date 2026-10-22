// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the users load.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Users"
      description="The people who can sign in, and what each may do: admins run the site, editors look after all content, authors write their own posts."
      kind="list"
    />
  );
}
