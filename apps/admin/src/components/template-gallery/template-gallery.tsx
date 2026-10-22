// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  Alert,
  AlertDescription,
  AlertTitle,
  AspectRatio,
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import type { TemplateImage } from "@sitebuilder/templates/admin";
import Image from "next/image";
import { TemplateActivate } from "@/components/template-activate/template-activate";
import "./template-gallery.scss";

// A card for each installed template, after nuvui's card with a picture at the top: the home
// page as a computer and a phone show it, what it brings, and the button that applies it.
// The screenshots are served as they are (unoptimized): /_next/image belongs to the site zone,
// which doesn't serve the admin's /admin-static files, and they're already small.

export interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  version: string;
  // Bundled with Sitebuilder; one added from a folder hasn't been reviewed.
  reviewed: boolean;
  pages: number;
  posts: number;
  screenshots: readonly { image: TemplateImage; label: string }[];
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function TemplateGallery({
  templates,
  active,
}: {
  templates: readonly TemplateSummary[];
  active: string;
}) {
  return (
    <div className="template-gallery">
      <Alert intent="info" role="note" className="template-gallery__note">
        <AlertTitle>Where templates come from</AlertTitle>
        <AlertDescription>
          These come with Sitebuilder and update with it. Adding a template of your own arrives in a
          later version.
        </AlertDescription>
      </Alert>
      <ul className="template-gallery__list">
        {templates.map((template) => {
          const [desktop, phone] = template.screenshots;
          const isActive = template.slug === active;
          const brings = [
            template.pages > 0 ? count(template.pages, "page", "pages") : null,
            template.posts > 0 ? count(template.posts, "post", "posts") : null,
          ].filter(Boolean);
          return (
            <li key={template.slug} className="template-gallery__item">
              <Card className="template-gallery__card">
                {desktop ? (
                  <div className="template-gallery__shots">
                    <AspectRatio ratio={16 / 10}>
                      <Image
                        src={desktop.image}
                        alt={`${template.name}: ${desktop.label.toLowerCase()}`}
                        sizes="(min-width: 64rem) 30rem, 100vw"
                        unoptimized
                      />
                    </AspectRatio>
                    {phone ? (
                      <Image
                        className="template-gallery__phone"
                        src={phone.image}
                        alt={`${template.name}: ${phone.label.toLowerCase()}`}
                        sizes="6rem"
                        unoptimized
                      />
                    ) : null}
                  </div>
                ) : null}
                <CardHeader>
                  <CardTitle asChild>
                    <h2>{template.name}</h2>
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                  <CardAction>
                    {isActive ? <Badge intent="success">In use</Badge> : null}
                    {template.reviewed ? null : (
                      <Badge intent="warning" variant="outline">
                        Not reviewed
                      </Badge>
                    )}
                  </CardAction>
                </CardHeader>
                <CardContent className="template-gallery__facts">
                  {brings.length > 0 ? `Starter content: ${brings.join(" and ")}. ` : null}
                  Version {template.version}.
                </CardContent>
                <CardFooter>
                  <TemplateActivate slug={template.slug} name={template.name} active={isActive} />
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
