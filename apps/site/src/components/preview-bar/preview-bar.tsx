import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import "./preview-bar.scss";

// Above a page drawn in draft mode (design §7): says what this is, and how to leave it.

const STATUS_TEXT = {
  draft: "This is a draft. Visitors can't see it until it's published.",
  scheduled: "This is scheduled. Visitors can't see it until its publish time.",
  published: "This is the published page as it is now.",
} as const;

export function PreviewBar({ status, path }: { status: keyof typeof STATUS_TEXT; path: string }) {
  return (
    <div className="preview-bar">
      <Alert intent="warning" className="preview-bar__alert">
        <AlertTitle asChild>
          <h2>Preview</h2>
        </AlertTitle>
        <AlertDescription>{STATUS_TEXT[status]}</AlertDescription>
        <AlertActions>
          <Button asChild intent="secondary" size="sm">
            <a href={`/api/preview/exit?path=${encodeURIComponent(path)}`}>Leave preview</a>
          </Button>
        </AlertActions>
      </Alert>
    </div>
  );
}
