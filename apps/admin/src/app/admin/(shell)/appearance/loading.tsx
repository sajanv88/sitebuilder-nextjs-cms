// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { ScreenSkeleton } from "@/components/screen-skeleton/screen-skeleton";

// Shown at once while the theme loads.
export default function Loading() {
  return (
    <ScreenSkeleton
      title="Appearance"
      description="How the public site looks: a theme, light or dark, how roomy controls are, and your own colors. The preview shows each change before you save."
      kind="panes"
      width="wide"
    />
  );
}
