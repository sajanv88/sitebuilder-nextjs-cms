// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { BLOCKS } from "@sitebuilder/blocks";
import { useCallback, useEffect, useState } from "react";

// The block types a person has pinned to the top of the inserter. A convenience, not content:
// kept in this browser, under the person's id, and read safely where storage is blocked
// (decisions #86). Unknown types, such as one a later release removed, are dropped on reading.

const key = (userId: string) => `sitebuilder:pinned-blocks:${userId}`;
const KNOWN = new Set(BLOCKS.map((definition) => definition.type));

function read(userId: string): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key(userId)) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((type): type is string => typeof type === "string" && KNOWN.has(type))
      : [];
  } catch {
    return [];
  }
}

export function usePinnedBlocks(userId: string): [string[], (pinned: string[]) => void] {
  // Empty on the server and on the first render, so the two agree; the stored pins arrive
  // after.
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => setPinned(read(userId)), [userId]);

  const save = useCallback(
    (next: string[]) => {
      setPinned(next);
      try {
        window.localStorage.setItem(key(userId), JSON.stringify(next));
      } catch {
        // Storage is blocked or full: the pins last until the page is closed.
      }
    },
    [userId],
  );
  return [pinned, save];
}
