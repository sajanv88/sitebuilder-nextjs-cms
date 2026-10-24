// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { SparklesIcon } from "@nuvui/icons";
import { can } from "@sitebuilder/auth";
import { db, getSettings } from "@sitebuilder/db";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/auth/session";
import { AdminEmpty } from "@/components/admin-empty/admin-empty";
import { AdminPage } from "@/components/admin-page/admin-page";
import { CreateWithAi } from "@/components/create-with-ai/create-with-ai";

export const metadata: Metadata = { title: "Create with AI" };

const PROVIDERS = { anthropic: "Anthropic", openai: "OpenAI", ollama: "Ollama" } as const;

// Create with AI (design §15, phase 8 plan 8.6): admins only (ai.generateSite). Without AI
// settings, it says where to set them up.
export default async function CreateWithAiPage() {
  const viewer = await requirePermission("ai.generateSite");
  const settings = await getSettings(db, "ai");

  return (
    <AdminPage
      title="Create with AI"
      description="Describe the site, answer a few questions, and the assistant drafts its pages for you to check and publish."
      trail={[{ label: "Pages", href: "/admin/pages" }]}
      width="narrow"
    >
      {settings ? (
        <CreateWithAi provider={PROVIDERS[settings.provider]} model={settings.model} />
      ) : (
        <AdminEmpty icon={<SparklesIcon aria-hidden="true" />} title="AI isn't set up">
          Choose a provider and give its key in Settings, AI; nothing is sent anywhere until then.{" "}
          {can(viewer, "settings.update") ? (
            <Link href="/admin/settings?section=ai">Set up AI</Link>
          ) : (
            "Ask an admin to set it up."
          )}
        </AdminEmpty>
      )}
    </AdminPage>
  );
}
