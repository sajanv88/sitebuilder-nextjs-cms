import * as v from "valibot";

// How dates are written, and in which time zone (decisions #69). Dates are stored in UTC and
// shown in the site's zone with the zone named, the same on the server and in the browser, so
// nothing differs between a server render and hydration (design §7).

// date-fns tokens, which nuvui's DatePicker reads and writes.
export const DATE_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "d MMMM yyyy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DateFormatSchema = v.picklist(DATE_FORMATS, "Choose a date format");

export const DEFAULT_DATE_FORMAT: DateFormat = "dd/MM/yyyy";
export const DEFAULT_TIME_ZONE = "Europe/London";

// An IANA zone name the runtime knows, such as "Europe/Amsterdam" or "UTC".
export function isTimeZone(name: string): boolean {
  if (!/^[A-Za-z0-9_+/-]{1,64}$/.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
export const TimeZoneSchema = v.pipe(v.string(), v.check(isTimeZone, "Choose a time zone"));

export interface DateSettings {
  dateFormat: DateFormat;
  timeZone: string;
}

// The month-first format is the American one, whose weeks start on Sunday; the others Monday.
export function weekStartsOn(format: DateFormat): 0 | 1 {
  return format === "MM/dd/yyyy" ? 0 : 1;
}

// The pattern a date is typed in: the written-out month can't be typed, so day first.
export function inputFormat(format: DateFormat): string {
  return format === "d MMMM yyyy" ? "dd/MM/yyyy" : format;
}

// "dd/mm/yyyy", for a placeholder.
export function formatHint(format: DateFormat): string {
  return inputFormat(format).toLowerCase();
}

export interface ZonedParts {
  year: number;
  // 1 to 12.
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  let format = partsFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partsFormats.set(timeZone, format);
  }
  return format;
}

// The calendar date and time a moment has in a zone.
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of partsFormat(timeZone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

// The moment a wall-clock date and time in a zone stands for. A time skipped by a clock change
// moves forward with it; a time that happens twice is the first of the two.
export function fromZoned(parts: ZonedParts, timeZone: string): Date {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // The zone's offset at a guess, then at the corrected guess: two steps settle every case.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const seen = zonedParts(new Date(guess), timeZone);
    const seenWall = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    guess += wall - seenWall;
  }
  return new Date(guess);
}

const pad = (n: number) => String(n).padStart(2, "0");

const monthNames = new Map<string, Intl.DateTimeFormat>();

function monthName(month: number, language: string): string {
  let format = monthNames.get(language);
  if (!format) {
    format = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" });
    monthNames.set(language, format);
  }
  return format.format(new Date(Date.UTC(2000, month - 1, 1)));
}

// "31/12/2026", "12/31/2026", "2026-12-31" or "31 December 2026", in the site's zone.
export function formatDate(date: Date, settings: DateSettings, language = "en"): string {
  const { year, month, day } = zonedParts(date, settings.timeZone);
  switch (settings.dateFormat) {
    case "dd/MM/yyyy":
      return `${pad(day)}/${pad(month)}/${year}`;
    case "MM/dd/yyyy":
      return `${pad(month)}/${pad(day)}/${year}`;
    case "yyyy-MM-dd":
      return `${year}-${pad(month)}-${pad(day)}`;
    case "d MMMM yyyy":
      return `${day} ${monthName(month, language)} ${year}`;
  }
}

const zoneNames = new Map<string, Intl.DateTimeFormat>();

// "GMT", "BST", "CET", or "GMT+5:30" where a zone has no short name.
export function zoneName(date: Date, timeZone: string): string {
  let format = zoneNames.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" });
    zoneNames.set(timeZone, format);
  }
  return format.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

// "14:05", on a 24-hour clock, in the site's zone.
export function formatTime(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

// "31/12/2026, 14:05 GMT".
export function formatDateTime(date: Date, settings: DateSettings, language = "en"): string {
  return `${formatDate(date, settings, language)}, ${formatTime(date, settings.timeZone)} ${zoneName(date, settings.timeZone)}`;
}

// The zones to choose from, from the runtime. Node and every current browser know them.
export function timeZoneNames(): string[] {
  const names = Intl.supportedValuesOf("timeZone");
  return names.includes("UTC") ? names : ["UTC", ...names];
}
