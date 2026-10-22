// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { PageLayoutProps } from "@sitebuilder/template-sdk";
import { Entry } from "./entry";

export default function Page(props: PageLayoutProps) {
  return <Entry {...props} />;
}
