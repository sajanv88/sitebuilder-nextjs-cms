// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { aiSettingsView } from "@sitebuilder/ai";
import { DEFAULT_READING, db, getSettings, listPublishedPages } from "@sitebuilder/db";
import { describeEnvironment, openSecret } from "@sitebuilder/media";
import { defaultSettings, timeZoneNames } from "@sitebuilder/schema";
import type { Metadata } from "next";
import type { StorageFormValues } from "@/actions/media-storage";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { AiSettingsForm } from "@/components/ai-settings-form/ai-settings-form";
import {
  type EnvironmentSummary,
  MediaStorageForm,
} from "@/components/media-storage-form/media-storage-form";
import { DatesForm, ReadingForm, SiteForm } from "@/components/settings-forms/settings-forms";
import { SettingsLayout, SettingsSection } from "@/components/settings-layout/settings-layout";
import { env } from "@/env";
import { LATEST_POSTS } from "@/lib/reading";

export const metadata: Metadata = { title: "Settings" };

// The page's sections, its tabs. The sidebar links to each as ?section=<id> (admin-nav.tsx).
const SECTIONS = [
  { id: "site", title: "Site" },
  { id: "reading", title: "Reading" },
  { id: "dates", title: "Dates" },
  { id: "media-storage", title: "Media storage" },
  { id: "ai", title: "AI" },
];

// Settings (design §5.4, §8): the site, reading, dates, media storage (decisions #45) and the AI
// assistant (design §15). Admins only.
export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requirePermission("settings.update");
  // The open tab: the one the address names, or the first.
  const asked = (await searchParams).section;
  const section = SECTIONS.find((s) => s.id === asked)?.id ?? "site";
  const config = env();
  const defaults = defaultSettings(config.SITE_URL);
  const [savedSite, savedReading, pages, saved, savedAi] = await Promise.all([
    getSettings(db, "site"),
    getSettings(db, "reading"),
    listPublishedPages(db),
    getSettings(db, "media"),
    getSettings(db, "ai"),
  ]);
  const site = savedSite ?? defaults.site;
  const reading = savedReading ?? DEFAULT_READING;

  const described = describeEnvironment(config);
  const environment: EnvironmentSummary =
    described.driver === "local"
      ? { driver: "local", where: described.dir }
      : { driver: "s3", where: `${described.bucket} at ${described.endpoint}` };

  // The form gets the saved settings without the secret, and only whether one is saved.
  const initial: StorageFormValues =
    saved?.driver === "s3"
      ? {
          driver: "s3",
          endpoint: saved.endpoint,
          region: saved.region,
          bucket: saved.bucket,
          accessKeyId: saved.accessKeyId,
          pathStyle: saved.pathStyle,
        }
      : {
          driver: saved?.driver ?? "environment",
          endpoint: "",
          region: "",
          bucket: "",
          accessKeyId: "",
          pathStyle: true,
        };
  const secret =
    saved?.driver !== "s3"
      ? "none"
      : openSecret(saved.secret, config.AUTH_SECRET) === null
        ? "unreadable"
        : "saved";

  return (
    <AdminPage
      title="Settings"
      description="How the site is named, what visitors see first, how dates are written, where uploads are kept, and the AI assistant."
      trail={[]}
    >
      <SettingsLayout sections={SECTIONS} section={section}>
        <SettingsSection
          id="site"
          title="Site"
          description="The site's name and tagline, its language, and the address visitors use."
        >
          <SiteForm
            initial={{
              title: site.title,
              tagline: site.tagline,
              language: site.language,
              siteUrl: site.siteUrl,
            }}
          />
        </SettingsSection>
        <SettingsSection
          id="reading"
          title="Reading"
          description="What the site's address shows, and where and how posts are listed."
        >
          <ReadingForm
            initial={{
              homepage: reading.homepageEntryId ?? LATEST_POSTS,
              postsPerPage: String(reading.postsPerPage),
              postsPath: reading.postsPath,
              showReadingProgress: reading.showReadingProgress ? "on" : "",
            }}
            pages={pages}
          />
        </SettingsSection>
        <SettingsSection
          id="dates"
          title="Dates"
          description="How dates are written on the site and here, and the time zone they're in."
        >
          <DatesForm
            initial={{ dateFormat: site.dateFormat, timeZone: site.timeZone }}
            zones={timeZoneNames()}
            language={site.language}
          />
        </SettingsSection>
        <SettingsSection
          id="media-storage"
          title="Media storage"
          description="Where uploaded images, videos and documents are kept. Files already uploaded stay where they are when this changes."
        >
          <MediaStorageForm initial={initial} environment={environment} secret={secret} />
        </SettingsSection>
        <SettingsSection
          id="ai"
          title="AI"
          description="An assistant that drafts pages and helps with one, using your own key. What you ask for and the page you're working on are sent to the provider you choose, under its terms."
        >
          {/* The view has whether a key is saved and its last four characters, never the key. */}
          <AiSettingsForm
            initial={aiSettingsView(savedAi, config.AUTH_SECRET)}
            allowPrivate={config.AI_ALLOW_PRIVATE_URLS}
            locale={site.language}
          />
        </SettingsSection>
      </SettingsLayout>
    </AdminPage>
  );
}
