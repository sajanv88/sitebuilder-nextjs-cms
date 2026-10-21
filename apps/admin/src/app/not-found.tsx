// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Button } from "@nuvui/react";

export default function NotFound() {
  return (
    <main className="page">
      <h1 className="page__title">Page not found</h1>
      <Button asChild intent="secondary">
        <a href="/admin">Back to the admin</a>
      </Button>
    </main>
  );
}
