// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ErrorView } from "@/components/error-view/error-view";

// An error in a page: shown inside the template's frame, so the menus are there to carry on from.
export default function SitePageError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView {...props} />;
}
