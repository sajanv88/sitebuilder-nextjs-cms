// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { MenuItem } from "@sitebuilder/template-sdk";

export function Nav({ items, currentPath }: { items: readonly MenuItem[]; currentPath: string }) {
  return (
    <nav aria-label="Main">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.href ? (
              <a href={item.href} aria-current={item.href === currentPath ? "page" : undefined}>
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
