// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ReactNode } from "react";
import { SiteFrame } from "@/components/site-frame/site-frame";

// Every public page, in the active template's frame. Below the root layout, so a template layout
// that throws is caught by the root error page. Typed by hand: /_site isn't one of Next's typed
// layout routes (decisions #109).
export default function SitePagesLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
