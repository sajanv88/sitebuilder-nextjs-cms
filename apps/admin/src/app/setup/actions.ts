// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { bootstrapSite, db } from "@sitebuilder/db";
import { NewAdminInput } from "@sitebuilder/schema";
import { hashPassword } from "better-auth/crypto";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { env } from "@/env";

export type SetupState =
  | { ok: true }
  | {
      ok: false;
      errors?: Partial<Record<"name" | "email" | "password", string>>;
      message?: string;
      // What was typed, so the fields keep it: React resets a form after its action runs. Never
      // the password.
      values: { name: string; email: string };
    };

function typed(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 254) : "";
}

// No session to check: /setup exists for a site with no users at all. bootstrapSite re-checks
// that inside a locked transaction, so this action creates exactly one first admin and refuses
// every call after it, whoever makes it.
export async function setupSite(_: SetupState, form: FormData): Promise<SetupState> {
  const input = v.safeParse(NewAdminInput, {
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  const values = { name: typed(form, "name"), email: typed(form, "email") };
  if (!input.success) {
    const nested = v.flatten<typeof NewAdminInput>(input.issues).nested ?? {};
    return {
      ok: false,
      values,
      errors: {
        ...(nested.name ? { name: nested.name[0] } : {}),
        ...(nested.email ? { email: "Enter a valid email address" } : {}),
        ...(nested.password ? { password: nested.password[0] } : {}),
      },
    };
  }

  const result = await bootstrapSite(db, {
    name: input.output.name,
    email: input.output.email,
    passwordHash: await hashPassword(input.output.password),
    siteUrl: env().SITE_URL,
    allowExistingUsers: false,
  });
  if (!result.ok) {
    return { ok: false, values, message: "This site is already set up. Sign in instead." };
  }
  redirect("/admin/sign-in?setup=done");
}
