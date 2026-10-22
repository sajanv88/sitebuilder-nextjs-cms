// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the settings load.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Settings"
      description="How the site is named, what visitors see first, how dates are written, and where uploads are kept."
      kind="form"
    />
  );
}
