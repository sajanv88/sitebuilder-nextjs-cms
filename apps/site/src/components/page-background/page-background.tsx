// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { pageBackgroundCss, type SettingsValue } from "@sitebuilder/schema";

// A background colour as a <style> (@sitebuilder/schema's page-background.ts). Marked, so the
// editor's canvas can turn the saved ones off while it shows the colour being picked.
export function PageBackground({
  color,
  theme,
  nonce,
}: {
  color: string;
  theme: SettingsValue<"theme">;
  nonce: string;
}) {
  const css = pageBackgroundCss(color, theme);
  return css ? (
    <style nonce={nonce} data-page-background="">
      {css}
    </style>
  ) : null;
}
