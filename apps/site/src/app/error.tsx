// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { ErrorView } from "@/components/error-view/error-view";

// An error in the template's frame (its Site layout), or anywhere outside a page: shown with the
// site's own styles alone, since the template is what failed.
export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView {...props} />;
}
