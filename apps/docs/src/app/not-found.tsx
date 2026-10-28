// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Button, Empty, EmptyActions, EmptyDescription, EmptyTitle } from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";

// The start page, typed as a route: TypeScript 7 sometimes rejects the literal "/" in a
// Link's href, depending on the order it checks files in (decisions #153).
const HOME: Route = "/";

export default function NotFound() {
  return (
    <Empty>
      <EmptyTitle asChild>
        <h1>There's no page here</h1>
      </EmptyTitle>
      <EmptyDescription>
        It may have moved. The contents on the left list every page.
      </EmptyDescription>
      <EmptyActions>
        <Button asChild>
          <Link href={HOME}>Go to the start</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
