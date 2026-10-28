// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { can } from "@sitebuilder/auth";
import { db, deleteSettings, getSettings, upsertSettings } from "@sitebuilder/db";
import { openPassword, sealPassword, verifyMail } from "@sitebuilder/mail";
import { EmailInput } from "@sitebuilder/schema";
import * as v from "valibot";
import { getViewer } from "@/auth/session";
import { env } from "@/env";

// Settings → Email (decisions #147): the SMTP server password links go through. Admins only.
// A server is saved only once it accepted a connection and the user name and password; nothing
// is sent to check it.

export type EmailFormValues = {
  // "environment" or "smtp".
  source: string;
  host: string;
  port: string;
  security: string;
  username: string;
  fromName: string;
  fromAddress: string;
};

export interface EmailFormState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  errors?: Partial<Record<keyof EmailFormValues | "password", string>>;
  values: EmailFormValues;
  at?: number;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 1000) : "";
}

export async function saveEmail(_: EmailFormState, form: FormData): Promise<EmailFormState> {
  const values: EmailFormValues = {
    source: text(form, "source") || "environment",
    host: text(form, "host"),
    port: text(form, "port"),
    security: text(form, "security") || "starttls",
    username: text(form, "username"),
    fromName: text(form, "fromName"),
    fromAddress: text(form, "fromAddress"),
  };
  const fail = (
    result: EmailFormState["result"],
    message: string,
    errors?: EmailFormState["errors"],
  ): EmailFormState => ({ result, message, values, ...(errors ? { errors } : {}) });

  const viewer = await getViewer();
  if (!viewer) return fail("failed", "Your session has ended. Sign in again.");
  if (!can(viewer, "settings.update")) return fail("failed", "Only an admin can change this.");

  const input = v.safeParse(EmailInput, { ...values, password: text(form, "password") });
  if (!input.success) {
    const nested = v.flatten(input.issues).nested ?? {};
    const errors: EmailFormState["errors"] = {};
    for (const key of [
      "host",
      "port",
      "security",
      "username",
      "password",
      "fromName",
      "fromAddress",
    ] as const) {
      const message = nested[key]?.[0];
      if (message) errors[key] = message;
    }
    return fail("invalid", "Check the fields marked below.", errors);
  }
  if (input.output.source === "environment") {
    await deleteSettings(db, "email");
    return {
      result: "saved",
      message: "Email now comes from the environment.",
      values,
      at: Date.now(),
    };
  }

  const smtp = input.output;
  const { AUTH_SECRET } = env();
  // A password left empty keeps the saved one, for the same server and user name.
  const saved = await getSettings(db, "email");
  const keeps =
    smtp.password === "" &&
    saved?.password &&
    saved.host === smtp.host &&
    saved.username === smtp.username;
  const password = smtp.username
    ? smtp.password || (keeps && saved.password ? openPassword(saved.password, AUTH_SECRET) : null)
    : null;
  if (smtp.username && password === null) {
    return fail("invalid", "Check the fields marked below.", {
      password: "Enter the password for this user name.",
    });
  }

  const checked = await verifyMail({
    host: smtp.host,
    port: smtp.port,
    security: smtp.security,
    username: smtp.username,
    password,
    from: { name: smtp.fromName, address: smtp.fromAddress },
  });
  if (!checked.ok) return fail("failed", `Not saved. ${checked.message}`);

  const stored = await upsertSettings(db, "email", {
    host: smtp.host,
    port: smtp.port,
    security: smtp.security,
    username: smtp.username,
    password: password ? sealPassword(password, AUTH_SECRET) : null,
    fromName: smtp.fromName,
    fromAddress: smtp.fromAddress,
  });
  if (!stored.ok) return fail("failed", "The settings couldn't be saved.");
  return {
    result: "saved",
    message: "Saved. The server accepted the connection.",
    values,
    at: Date.now(),
  };
}
