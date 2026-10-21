// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import type { ReactNode } from "react";

// A screen with nothing in it yet. The title is an h2: the page's h1 is above it.
export function AdminEmpty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Empty>
      <EmptyMedia>{icon}</EmptyMedia>
      <EmptyTitle asChild>
        <h2>{title}</h2>
      </EmptyTitle>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}
