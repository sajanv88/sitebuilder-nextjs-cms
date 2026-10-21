// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { FileTextIcon } from "@nuvui/icons";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Timeline,
  TimelineContent,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@nuvui/react";
import type { RecentEntry } from "@sitebuilder/db";
import { type DateSettings, formatDateTime } from "@sitebuilder/schema";
import type { Route } from "next";
import Link from "next/link";
import "./recent-changes.scss";

// The pages and posts changed last, after nuvui's activity block: what, by whom, when, and
// where it stands. Each opens in the editor.

const STATUS = {
  published: { label: "Published", intent: "success" },
  scheduled: { label: "Scheduled", intent: "primary" },
  draft: { label: "Draft", intent: "neutral" },
} as const;

export function RecentChanges({
  entries,
  dates,
}: {
  entries: RecentEntry[];
  dates: DateSettings & { language: string };
}) {
  return (
    <Card className="recent-changes">
      <CardHeader>
        <CardTitle asChild>
          <h2>Recent changes</h2>
        </CardTitle>
        <CardDescription>Pages and posts, the last changed first.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <FileTextIcon aria-hidden="true" size={24} />
            </EmptyMedia>
            <EmptyTitle>Nothing written yet</EmptyTitle>
            <EmptyDescription>Pages and posts show up here as they're changed.</EmptyDescription>
          </Empty>
        ) : (
          <Timeline aria-label="Recent changes">
            {entries.map((entry) => (
              <TimelineItem key={entry.id}>
                <TimelineMarker intent={entry.status === "published" ? "success" : "neutral"} />
                <TimelineContent>
                  <TimelineTitle className="recent-changes__title">
                    <Link
                      className="recent-changes__link"
                      href={`/admin/${entry.type}s/${entry.id}` as Route}
                    >
                      {entry.title}
                    </Link>
                    <Badge variant="outline" intent={STATUS[entry.status].intent}>
                      {STATUS[entry.status].label}
                    </Badge>
                  </TimelineTitle>
                  <TimelineTime dateTime={entry.updatedAt.toISOString()}>
                    {entry.type === "page" ? "Page" : "Post"} by {entry.authorName},{" "}
                    {formatDateTime(entry.updatedAt, dates, dates.language)}
                  </TimelineTime>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </CardContent>
    </Card>
  );
}
