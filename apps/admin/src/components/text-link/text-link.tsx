// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./text-link.scss";

// A link in running text: the theme's primary color, underlined, the same before and after a
// visit. nuvui has no text link of its own; its links are buttons and navigation.
export function TextLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className="text-link">
      {children}
    </Link>
  );
}
