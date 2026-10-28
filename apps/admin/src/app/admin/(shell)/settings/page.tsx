// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { aiSettingsView } from "@sitebuilder/ai";
import {
  countMediaByStorage,
  DEFAULT_READING,
  db,
  getSettings,
  listPublishedPages,
} from "@sitebuilder/db";
import { mailConfig, openPassword } from "@sitebuilder/mail";
import { describeEnvironment, openSecret, uploadStorage } from "@sitebuilder/media";
import {
  analyticsService,
  defaultSettings,
  POSTHOG_HOSTS,
  timeZoneNames,
} from "@sitebuilder/schema";
import type { Metadata } from "next";
import type { StorageFormValues } from "@/actions/media-storage";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { AiSettingsForm } from "@/components/ai-settings-form/ai-settings-form";
import { EmailSettingsForm } from "@/components/email-settings-form/email-settings-form";
import { MediaMove } from "@/components/media-move/media-move";
import {
  type EnvironmentSummary,
  MediaStorageForm,
} from "@/components/media-storage-form/media-storage-form";
import {
  AnalyticsForm,
  DatesForm,
  ReadingForm,
  SiteForm,
} from "@/components/settings-forms/settings-forms";
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
  { id: "analytics", title: "Analytics" },
  { id: "email", title: "Email" },
];

// Settings (design §5.4, §8): the site, reading, dates, media storage (decisions #45), the AI
// assistant (design §15), analytics and email. Admins only.
export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requirePermission("settings.update");
  // The open tab: the one the address names, or the first.
  const asked = (await searchParams).section;
  const section = SECTIONS.find((s) => s.id === asked)?.id ?? "site";
  const config = env();
  const defaults = defaultSettings(config.SITE_URL);
  const [savedSite, savedReading, pages, saved, savedAi, analytics] = await Promise.all([
    getSettings(db, "site"),
    getSettings(db, "reading"),
    listPublishedPages(db),
    getSettings(db, "media"),
    getSettings(db, "ai"),
    getSettings(db, "analytics"),
  ]);
  const savedEmail = await getSettings(db, "email");
  // What the SMTP_* variables set up, without their secrets.
  const fromEnvironment = mailConfig({
    settings: null,
    env: config,
    authSecret: config.AUTH_SECRET,
  });
  const environmentMail = fromEnvironment.ok
    ? `${fromEnvironment.config.host}:${fromEnvironment.config.port}, from ${fromEnvironment.config.from.address}.`
    : null;
  const posthogRegion = !analytics?.posthog
    ? "eu"
    : analytics.posthog.host === POSTHOG_HOSTS.us
      ? "us"
      : analytics.posthog.host === POSTHOG_HOSTS.eu
        ? "eu"
        : "custom";
  const site = savedSite ?? defaults.site;
  // Where uploads go now, and how many files are elsewhere (decisions #150).
  const counts = await countMediaByStorage(db);
  const uploadsTo = uploadStorage({ settings: saved, env: config });
  const uploadsGo = uploadsTo.ok ? uploadsTo.storage.kind : null;
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
          publicUrl: saved.publicUrl ?? "",
        }
      : {
          driver: saved?.driver ?? "environment",
          endpoint: "",
          region: "",
          bucket: "",
          accessKeyId: "",
          pathStyle: true,
          publicUrl: "",
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
      description="How the site is named, what visitors see first, how dates are written, where uploads are kept, the AI assistant and analytics."
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
              search: reading.search ? "on" : "",
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
          <MediaMove
            elsewhere={uploadsGo === "s3" ? counts.local : uploadsGo === "local" ? counts.s3 : 0}
            from={uploadsGo === "s3" ? "on the server's disk" : "in S3 storage"}
            to={uploadsGo === "s3" ? "to S3 storage" : "to the server's disk"}
          />
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
        <SettingsSection
          id="email"
          title="Email"
          description="The server password reset links and invitations are sent through."
        >
          <EmailSettingsForm
            initial={{
              source: savedEmail ? "smtp" : "environment",
              host: savedEmail?.host ?? "",
              port: String(savedEmail?.port ?? 587),
              security: savedEmail?.security ?? "starttls",
              username: savedEmail?.username ?? "",
              fromName: savedEmail?.fromName ?? site.title,
              fromAddress: savedEmail?.fromAddress ?? "",
            }}
            environment={environmentMail}
            password={
              !savedEmail?.password
                ? "none"
                : openPassword(savedEmail.password, config.AUTH_SECRET) === null
                  ? "unreadable"
                  : "saved"
            }
          />
        </SettingsSection>
        <SettingsSection
          id="analytics"
          title="Analytics"
          description="One service visits are counted with, behind a consent banner, and Search Console's verification."
        >
          <AnalyticsForm
            initial={{
              service: analyticsService(analytics),
              ga4: analytics?.ga4 ?? "",
              gtm: analytics?.gtm ?? "",
              searchConsole: analytics?.searchConsole ?? "",
              posthogKey: analytics?.posthog?.key ?? "",
              posthogRegion,
              posthogHost: posthogRegion === "custom" ? (analytics?.posthog?.host ?? "") : "",
              privacyEntryId: analytics?.privacyEntryId ?? "",
            }}
            pages={pages}
          />
        </SettingsSection>
      </SettingsLayout>
    </AdminPage>
  );
}
