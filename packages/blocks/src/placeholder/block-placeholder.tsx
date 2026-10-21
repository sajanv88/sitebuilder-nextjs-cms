// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { IconComponent } from "@nuvui/icons";
import "./block-placeholder.scss";

// What a block draws in the editor's canvas while it has nothing to show yet: an image with no
// file chosen, a link to a page that's gone. Visitors never see it; blocks draw nothing instead.
export function BlockPlaceholder({
  icon: Icon,
  children,
}: {
  icon: IconComponent;
  children: string;
}) {
  return (
    <div className="block-placeholder">
      <Icon aria-hidden="true" size={20} />
      <span>{children}</span>
    </div>
  );
}
