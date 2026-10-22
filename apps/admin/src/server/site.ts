// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { db, getSettings } from "@sitebuilder/db";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_ZONE } from "@sitebuilder/schema";
import { cache } from "react";

// Settings → Site, read once per request: the shell's layout and the dashboard both want it.
export const getSiteSettings = cache(() => getSettings(db, "site"));

// How dates are written across the admin: the site's format and zone (decisions #69).
export async function getSiteDates() {
  const site = await getSiteSettings();
  return {
    dateFormat: site?.dateFormat ?? DEFAULT_DATE_FORMAT,
    timeZone: site?.timeZone ?? DEFAULT_TIME_ZONE,
    language: site?.language ?? "en",
  };
}
