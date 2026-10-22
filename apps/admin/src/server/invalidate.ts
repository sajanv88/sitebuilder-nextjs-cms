// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { CacheTags, type MenuLocation } from "@sitebuilder/schema";
import { updateTag } from "next/cache";
import { ACTION_EFFECTS, type ActionName } from "./action-effects";

// Invalidates what an action changed on the public site. updateTag goes through the shared
// cache handler, so it reaches the site zone and every replica (decisions #63). Called after
// the write succeeds; a refused write changes nothing.
export function invalidate(
  action: ActionName,
  scope: {
    entryIds?: readonly string[];
    menu?: MenuLocation;
    menus?: readonly MenuLocation[];
  } = {},
): void {
  const tags = new Set<string>();
  for (const effect of ACTION_EFFECTS[action]) {
    switch (effect) {
      case "entries":
        tags.add(CacheTags.entries);
        for (const id of scope.entryIds ?? []) tags.add(CacheTags.entry(id));
        break;
      case "menu":
        for (const location of [...(scope.menu ? [scope.menu] : []), ...(scope.menus ?? [])]) {
          tags.add(CacheTags.menu(location));
        }
        break;
      case "redirects":
      case "terms":
      case "settings":
      case "media":
      case "template":
        tags.add(CacheTags[effect]);
        break;
    }
  }
  for (const tag of tags) updateTag(tag);
}
