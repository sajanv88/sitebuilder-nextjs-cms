// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "@nuvui/react/styles.css";
// The editor's canvas draws the same section and hero backdrops as the site.
import "@nuvui/backgrounds/styles.css";
import "@nuvui/date-picker/styles.css";
import "@nuvui/editor/styles.css";
import "@nuvui/media/styles.css";
import "@nuvui/table/styles.css";
import "@/styles/globals.scss";

import { Toaster } from "@nuvui/react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { NonceProvider } from "@/components/nonce-provider/nonce-provider";

export const metadata: Metadata = {
  title: { default: "Sitebuilder admin", template: "%s · Sitebuilder admin" },
};

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell. Data caching with "use cache" still works.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" data-theme="system" data-density="default">
      <body>
        <NonceProvider nonce={nonce}>{children}</NonceProvider>
        {/* Once, for the whole app: toast() calls from any client component show here. */}
        <Toaster />
      </body>
    </html>
  );
}
