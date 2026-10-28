// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// How long a private file's share link may last (decisions #149), in seconds, with its name.
export const SHARE_DURATIONS = [
  { seconds: 3600, label: "An hour" },
  { seconds: 86_400, label: "A day" },
  { seconds: 7 * 86_400, label: "A week" },
  { seconds: 30 * 86_400, label: "30 days" },
] as const;
