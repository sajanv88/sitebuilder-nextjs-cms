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
  listPublishedPages,
  recentEntries,
} from "@sitebuilder/db";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_ZONE } from "@sitebuilder/schema";
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { RecentChanges } from "@/components/recent-changes/recent-changes";
import { type SetupStep, SetupSteps } from "@/components/setup-steps/setup-steps";
import { TextLink } from "@/components/text-link/text-link";
import "./dashboard.scss";

export const metadata: Metadata = { title: "Dashboard" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The admin's first screen: how much there is, what changed last, and, for an admin, the
// steps left to a site ready for visitors.
export default async function DashboardPage() {
  const viewer = await requireViewer();
  const scope = {
    pages: canSome(viewer, "page.read"),
    ownerId: can(viewer, "post.read") ? null : viewer.id,
  };
  const [counts, recent, site] = await Promise.all([
    dashboardCounts(db, scope),
    recentEntries(db, scope),
    getSettings(db, "site"),
  ]);
  const dates = {
    dateFormat: site?.dateFormat ?? DEFAULT_DATE_FORMAT,
    timeZone: site?.timeZone ?? DEFAULT_TIME_ZONE,
    language: site?.language ?? "en",
  };

  let steps: SetupStep[] | null = null;
  if (can(viewer, "settings.update")) {
    const [reading, theme, primary, pages] = await Promise.all([
      getSettings(db, "reading"),
      getSettings(db, "theme"),
      getMenu(db, "primary"),
      listPublishedPages(db),
    ]);
    steps = [
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
        done: Boolean(
          theme && (theme.preset !== "default" || Object.keys(theme.tokens).length > 0),
        ),
        href: "/admin/appearance",
        action: "Open appearance",
      },
    ];
    if (steps.every((step) => step.done)) steps = null;
  }

  const canPages = can(viewer, "page.create");
  const canPosts = can(viewer, "post.create");

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
      <div className={steps ? "dashboard-screen__columns" : undefined}>
        <RecentChanges entries={recent} dates={dates} />
        {steps ? <SetupSteps steps={steps} /> : null}
      </div>
    </AdminPage>
  );
}
