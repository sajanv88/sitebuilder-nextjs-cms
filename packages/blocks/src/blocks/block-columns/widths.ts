// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Column widths (decisions #152): each column's share of the row in twelfths, written "4-8".
// The line between two columns sits at 1/4, 1/3, 1/2, 2/3 or 3/4 of the row, and no column is
// narrower than a quarter, so two columns have five layouts, three have six, and four are always
// equal. "equal" is each column the same, whatever their number; a layout written for another
// number of columns draws as equal.

export const COLUMN_WIDTHS = [
  "equal",
  "3-9",
  "4-8",
  "8-4",
  "9-3",
  "3-3-6",
  "3-5-4",
  "3-6-3",
  "4-5-3",
  "6-3-3",
] as const;
export type ColumnWidths = (typeof COLUMN_WIDTHS)[number];

// The twelfths of each column, or null when they're equal or written for another number.
export function widthsOf(value: string, count: number): number[] | null {
  if (value === "equal" || !(COLUMN_WIDTHS as readonly string[]).includes(value)) return null;
  const widths = value.split("-").map(Number);
  return widths.length === count ? widths : null;
}

// The layouts for this many columns, equal first.
export function columnWidthsFor(count: number): ColumnWidths[] {
  return COLUMN_WIDTHS.filter((value) => value === "equal" || widthsOf(value, count) !== null);
}

const FRACTIONS: Record<number, string> = { 3: "1/4", 4: "1/3", 5: "5/12", 6: "1/2", 9: "3/4" };

// "1/3 + 2/3", for the inspector.
export function columnWidthsLabel(value: ColumnWidths): string {
  if (value === "equal") return "Equal";
  return value
    .split("-")
    .map((n) => FRACTIONS[Number(n)] ?? (n === "8" ? "2/3" : `${n}/12`))
    .join(" + ");
}

// Where the lines between columns are, in twelfths of the row: [4] for 4-8.
const linesOf = (widths: readonly number[]): number[] =>
  widths.slice(0, -1).map((_, i) => widths.slice(0, i + 1).reduce((sum, w) => sum + w, 0));

// The layout when the line after column `line` (0 for the first) is dragged to `at`, a fraction
// of the row: the other lines stay where they are, and this one goes to the nearest place it
// may. The current layout is always one of the candidates (a mismatched one reads as equal).
export function dragColumnLine(
  value: string,
  count: number,
  line: number,
  at: number,
): ColumnWidths {
  const current = widthsOf(value, count) ?? Array.from({ length: count }, () => 12 / count);
  const now = linesOf(current);
  let best: { value: ColumnWidths; distance: number } | null = null;
  for (const candidate of columnWidthsFor(count)) {
    const lines = linesOf(widthsOf(candidate, count) ?? current.map(() => 12 / count));
    if (lines.some((place, i) => i !== line && place !== now[i])) continue;
    const distance = Math.abs((lines[line] ?? 0) - at * 12);
    if (!best || distance < best.distance) best = { value: candidate, distance };
  }
  return best?.value ?? "equal";
}
