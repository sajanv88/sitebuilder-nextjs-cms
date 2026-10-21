// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  fromZoned,
  isTimeZone,
  timeZoneNames,
  weekStartsOn,
  zonedParts,
} from "./dates";

const moment = new Date("2026-07-01T13:05:00Z");

describe("dates", () => {
  it("writes each format in the site's zone", () => {
    const zone = "Europe/London";
    expect(formatDate(moment, { dateFormat: "dd/MM/yyyy", timeZone: zone })).toBe("01/07/2026");
    expect(formatDate(moment, { dateFormat: "MM/dd/yyyy", timeZone: zone })).toBe("07/01/2026");
    expect(formatDate(moment, { dateFormat: "yyyy-MM-dd", timeZone: zone })).toBe("2026-07-01");
    expect(formatDate(moment, { dateFormat: "d MMMM yyyy", timeZone: zone })).toBe("1 July 2026");
    expect(formatDateTime(moment, { dateFormat: "dd/MM/yyyy", timeZone: zone })).toBe(
      "01/07/2026, 14:05 BST",
    );
  });

  it("moves the date across midnight with the zone", () => {
    const late = new Date("2026-12-31T23:30:00Z");
    expect(formatDate(late, { dateFormat: "yyyy-MM-dd", timeZone: "Asia/Tokyo" })).toBe(
      "2027-01-01",
    );
    expect(formatDate(late, { dateFormat: "yyyy-MM-dd", timeZone: "UTC" })).toBe("2026-12-31");
  });

  it("turns a wall-clock time in a zone back into the moment", () => {
    const parts = zonedParts(moment, "America/New_York");
    expect(parts).toEqual({ year: 2026, month: 7, day: 1, hour: 9, minute: 5 });
    expect(fromZoned(parts, "America/New_York").toISOString()).toBe(moment.toISOString());
    // 01:30 doesn't exist in London on the last Sunday of March: it moves forward.
    const skipped = fromZoned(
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
      "Europe/London",
    );
    expect(skipped.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("knows real zones only", () => {
    expect(isTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("<script>")).toBe(false);
    expect(timeZoneNames()).toContain("UTC");
  });

  it("starts the American week on Sunday", () => {
    expect(weekStartsOn("MM/dd/yyyy")).toBe(0);
    expect(weekStartsOn("dd/MM/yyyy")).toBe(1);
  });
});
