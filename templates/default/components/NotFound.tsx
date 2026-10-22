// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Button } from "@nuvui/react";

// Unknown and unpublished paths, answered with a 404 inside the site's own frame, so the menus
// are there to carry on from.
export default function NotFound() {
  return (
    <div className="not-found">
      <h1 className="not-found__title">Page not found</h1>
      <p className="not-found__text">The page may have moved, or it isn't published.</p>
      <Button asChild intent="secondary" className="not-found__action">
        <a href="/">Go to the home page</a>
      </Button>
    </div>
  );
}
