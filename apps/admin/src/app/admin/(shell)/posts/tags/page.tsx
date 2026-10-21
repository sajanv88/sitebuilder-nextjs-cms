// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { TermScreen } from "@/components/term-screen/term-screen";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  return <TermScreen taxonomy="tag" />;
}
