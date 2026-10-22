// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while your account loads.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="My account"
      description="Your name as others see it, and the password you sign in with."
      kind="form"
      width="narrow"
    />
  );
}
