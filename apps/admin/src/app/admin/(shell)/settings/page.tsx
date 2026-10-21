import { DEFAULT_READING, db, getSettings, listPublishedPages } from "@sitebuilder/db";
import { describeEnvironment, openSecret } from "@sitebuilder/media";
import { defaultSettings, timeZoneNames } from "@sitebuilder/schema";
import type { Metadata } from "next";
import type { StorageFormValues } from "@/actions/media-storage";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import {
  type EnvironmentSummary,
  MediaStorageForm,
} from "@/components/media-storage-form/media-storage-form";
import { DatesForm, ReadingForm, SiteForm } from "@/components/settings-forms/settings-forms";
import { SettingsLayout, SettingsSection } from "@/components/settings-layout/settings-layout";
import { env } from "@/env";
import { LATEST_POSTS } from "@/lib/reading";

export const metadata: Metadata = { title: "Settings" };

// The page's sections, for its contents list and the sidebar's links (admin-nav.tsx).
const SECTIONS = [
  { id: "site", title: "Site" },
  { id: "reading", title: "Reading" },
  { id: "dates", title: "Dates" },
  { id: "media-storage", title: "Media storage" },
];

// Settings (design §5.4, §8): the site, reading, dates, and media storage (decisions #45).
// Admins only.
export default async function SettingsPage() {
  await requirePermission("settings.update");
  const config = env();
  const defaults = defaultSettings(config.SITE_URL);
  const site = (await getSettings(db, "site")) ?? defaults.site;
  const reading = (await getSettings(db, "reading")) ?? DEFAULT_READING;
  const pages = await listPublishedPages(db);
  const saved = await getSettings(db, "media");

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
      description="How the site is named, what visitors see first, how dates are written, and where uploads are kept."
      trail={[]}
    >
      <SettingsLayout sections={SECTIONS}>
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
      </SettingsLayout>
    </AdminPage>
  );
}
