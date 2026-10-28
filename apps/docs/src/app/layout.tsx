// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "@nuvui/react/styles.css";
import "@/styles/globals.scss";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DocsShell } from "@/components/docs-shell/docs-shell";

export const metadata: Metadata = {
  title: { default: "Sitebuilder documentation", template: "%s · Sitebuilder documentation" },
  description: "How to build and run a website with Sitebuilder, one feature at a time.",
};

// Every response carries a fresh CSP nonce (src/proxy.ts), so pages render per request instead
// of from a prerendered shell.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The sidebar opens as it was left (nuvui remembers it in this cookie).
  const sidebar = (await cookies()).get("nuv-sidebar")?.value;

  return (
    <html lang="en" data-theme="system" data-density="default">
      <body>
        <DocsShell sidebarOpen={sidebar !== "false"}>{children}</DocsShell>
      </body>
    </html>
  );
}
