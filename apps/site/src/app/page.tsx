import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nuvui/react";

// Placeholder until the public site renders entries (phase 4).
export default function HomePage() {
  return (
    <main className="page">
      <Card className="page__card">
        <CardHeader>
          <CardTitle>Sitebuilder</CardTitle>
          <CardDescription>This site has no content yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild intent="secondary">
            {/* The admin is another zone: a plain link, so the browser does a full load. */}
            <a href="/admin">Go to the admin</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
