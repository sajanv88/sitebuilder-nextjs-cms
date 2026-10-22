// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { FilePlusIcon, PlusIcon } from "@nuvui/icons";
import { Button, Stat, StatDescription, StatGroup, StatLabel, StatValue } from "@nuvui/react";
import { can, canSome } from "@sitebuilder/auth";
import {
  dashboardCounts,
  db,
  getMenu,
  getSettings,
  getTemplateSettings,
  listImportedEntries,
  listPublishedPages,
  recentEntries,
} from "@sitebuilder/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireViewer, type Viewer } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { RecentChanges } from "@/components/recent-changes/recent-changes";
import {
  CardSkeleton,
  FiguresSkeleton,
  Loading,
} from "@/components/screen-skeleton/screen-skeleton";
import { type SetupStep, SetupSteps } from "@/components/setup-steps/setup-steps";
import { TextLink } from "@/components/text-link/text-link";
import { getSiteDates, getSiteSettings } from "@/server/site";
import "./dashboard.scss";

export const metadata: Metadata = { title: "Dashboard" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// What the viewer counts and lists: every page if they may read pages, and only their own posts
// if they may only read their own.
function scopeOf(viewer: Viewer) {
  return {
    pages: canSome(viewer, "page.read"),
    ownerId: can(viewer, "post.read") ? null : viewer.id,
  };
}

async function Figures({ viewer }: { viewer: Viewer }) {
  const scope = scopeOf(viewer);
  const counts = await dashboardCounts(db, scope);
  return (
    <section aria-label="At a glance">
      <StatGroup>
        {scope.pages ? (
          <Stat>
            <StatLabel>Published pages</StatLabel>
            <StatValue>{counts.published.page}</StatValue>
            <StatDescription>
              <TextLink href="/admin/pages">All pages</TextLink>
            </StatDescription>
          </Stat>
        ) : null}
        <Stat>
          <StatLabel>Published posts</StatLabel>
          <StatValue>{counts.published.post}</StatValue>
          <StatDescription>
            <TextLink href="/admin/posts">All posts</TextLink>
          </StatDescription>
        </Stat>
        <Stat>
          <StatLabel>Drafts</StatLabel>
          <StatValue>{counts.drafts}</StatValue>
          <StatDescription>
            {counts.scheduled > 0
              ? `and ${plural(counts.scheduled, "scheduled entry", "scheduled entries")}`
              : "Only people who sign in see them"}
          </StatDescription>
        </Stat>
        <Stat>
          <StatLabel>Media files</StatLabel>
          <StatValue>{counts.media}</StatValue>
          <StatDescription>
            <TextLink href="/admin/media">The media library</TextLink>
          </StatDescription>
        </Stat>
      </StatGroup>
    </section>
  );
}

async function Recent({ viewer }: { viewer: Viewer }) {
  const [recent, dates] = await Promise.all([recentEntries(db, scopeOf(viewer)), getSiteDates()]);
  return <RecentChanges entries={recent} dates={dates} />;
}

// For an admin, the steps left to a site ready for visitors; nothing once they're all done.
async function Steps() {
  const [site, reading, theme, primary, pages, template] = await Promise.all([
    getSiteSettings(),
    getSettings(db, "reading"),
    getSettings(db, "theme"),
    getMenu(db, "primary"),
    listPublishedPages(db),
    getTemplateSettings(db),
  ]);
  const imported = await listImportedEntries(db, template.slug);
  const steps: SetupStep[] = [
    {
      id: "template",
      title: "Start from a template",
      text: "A ready-made look with starter pages to edit, or keep building your own.",
      // Done once a template other than the default is chosen, or one has brought pages, or
      // the site has pages of its own.
      done: template.slug !== "default" || imported.length > 0 || pages.length > 0,
      href: "/admin/templates",
      action: "See templates",
    },
    {
      id: "name",
      title: "Name your site",
      text: "Its title is in the header, the footer and every page's title.",
      done: Boolean(site && site.title !== "My Site"),
      href: "/admin/settings#site" as SetupStep["href"],
      action: "Open settings",
    },
    {
      id: "page",
      title: "Publish your first page",
      text: "An about page, a services page: build it from blocks.",
      done: pages.length > 0,
      href: "/admin/pages/new" as SetupStep["href"],
      action: "New page",
    },
    {
      id: "home",
      title: "Choose a home page",
      text: "What visitors see first. Until then it's the latest posts.",
      done: Boolean(reading?.homepageEntryId),
      href: "/admin/settings#reading" as SetupStep["href"],
      action: "Choose",
    },
    {
      id: "menu",
      title: "Build the main menu",
      text: "The links across the top of every page.",
      done: primary.length > 0,
      href: "/admin/menus",
      action: "Open menus",
    },
    {
      id: "look",
      title: "Pick a look",
      text: "A theme, light or dark, and your own colors.",
      done: Boolean(theme && (theme.preset !== "default" || Object.keys(theme.tokens).length > 0)),
      href: "/admin/appearance",
      action: "Open appearance",
    },
  ];
  return steps.every((step) => step.done) ? null : <SetupSteps steps={steps} />;
}

// The admin's first screen: how much there is, what changed last, and, for an admin, the
// steps left to a site ready for visitors. The header is drawn at once; the figures, the
// changes and the steps each stream in as their queries finish.
export default async function DashboardPage() {
  const [viewer, site] = await Promise.all([requireViewer(), getSiteSettings()]);
  const canPages = can(viewer, "page.create");
  const canPosts = can(viewer, "post.create");
  const steps = can(viewer, "settings.update");

  return (
    <AdminPage
      title="Dashboard"
      description={`Welcome back, ${viewer.name}. Here's how ${site?.title ?? "your site"} stands.`}
      actions={
        <>
          {canPages ? (
            <Button asChild intent="secondary">
              <Link href="/admin/pages/new">
                <FilePlusIcon aria-hidden="true" size={16} />
                New page
              </Link>
            </Button>
          ) : null}
          {canPosts ? (
            <Button asChild>
              <Link href="/admin/posts/new">
                <PlusIcon aria-hidden="true" size={16} />
                New post
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <Suspense
        fallback={
          <Loading label="Loading the figures">
            <FiguresSkeleton />
          </Loading>
        }
      >
        <Figures viewer={viewer} />
      </Suspense>
      <div className={steps ? "dashboard-screen__columns" : undefined}>
        <Suspense
          fallback={
            <Loading label="Loading recent changes">
              <CardSkeleton lines={5} />
            </Loading>
          }
        >
          <Recent viewer={viewer} />
        </Suspense>
        {steps ? (
          <Suspense fallback={<CardSkeleton lines={5} />}>
            <Steps />
          </Suspense>
        ) : null}
      </div>
    </AdminPage>
  );
}
