// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { TermScreen } from "@/components/term-screen/term-screen";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return <TermScreen taxonomy="category" />;
}
