import { Button } from "@nuvui/react";

// Unknown and unpublished paths, answered with a 404 (src/proxy.ts). Inside the site's own
// frame, so the menus are there to carry on from.
export default function NotFound() {
  return (
    <div className="page">
      <h1 className="page__title">Page not found</h1>
      <p className="page__meta">The page may have moved, or it isn't published.</p>
      <Button asChild intent="secondary" className="page__action">
        <a href="/">Go to the home page</a>
      </Button>
    </div>
  );
}
