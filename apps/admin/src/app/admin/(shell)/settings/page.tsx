import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import { db, getSettings } from "@sitebuilder/db";
import { describeEnvironment, openSecret } from "@sitebuilder/media";
import type { Metadata } from "next";
import type { StorageFormValues } from "@/actions/media-storage";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import {
  type EnvironmentSummary,
  MediaStorageForm,
} from "@/components/media-storage-form/media-storage-form";
import { env } from "@/env";
import "./settings.scss";

export const metadata: Metadata = { title: "Settings" };

// Settings (design §8). Phase 3 brings the first section, Media storage (decisions #45); the
// site, reading and date settings come in phase 4.
export default async function SettingsPage() {
  await requirePermission("settings.update");
  const config = env();
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
    <AdminPage title="Settings">
      <Card className="settings__card">
        <CardHeader>
          <CardTitle asChild>
            <h2>Media storage</h2>
          </CardTitle>
          <CardDescription>
            Where uploaded images, videos and documents are kept. Files already uploaded stay where
            they are when this changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaStorageForm initial={initial} environment={environment} secret={secret} />
        </CardContent>
      </Card>
    </AdminPage>
  );
}
