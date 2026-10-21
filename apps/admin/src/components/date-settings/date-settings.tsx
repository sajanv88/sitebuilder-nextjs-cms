// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  type DateSettings,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_ZONE,
  formatDateTime,
} from "@sitebuilder/schema";
import { createContext, type ReactNode, useCallback, useContext } from "react";

// The site's date format and time zone (Settings → Dates, decisions #69), for every date the
// admin shows. Formatting is fixed by the settings, not the browser, so the server's render
// and the browser's agree.

const Context = createContext<DateSettings & { language: string }>({
  dateFormat: DEFAULT_DATE_FORMAT,
  timeZone: DEFAULT_TIME_ZONE,
  language: "en",
});

export function DateSettingsProvider({
  value,
  children,
}: {
  value: DateSettings & { language: string };
  children: ReactNode;
}) {
  return <Context value={value}>{children}</Context>;
}

export function useDateSettings(): DateSettings & { language: string } {
  return useContext(Context);
}

// "31/12/2026, 14:05 GMT", in the site's format and zone.
export function useFormatDateTime(): (date: Date) => string {
  const settings = useDateSettings();
  return useCallback((date: Date) => formatDateTime(date, settings, settings.language), [settings]);
}
