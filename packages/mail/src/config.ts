// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  type EmailSecurity,
  type EmailSettings,
  parseFrom,
  SmtpHost,
  SmtpPort,
} from "@sitebuilder/schema";
import * as v from "valibot";
import { openPassword } from "./password";

// Where email goes out (decisions #147): the server saved in Settings → Email, else the SMTP_*
// environment variables, else nowhere.

export interface MailConfig {
  host: string;
  port: number;
  security: EmailSecurity;
  username: string | null;
  password: string | null;
  from: { name: string; address: string };
}

export interface MailSources {
  settings: EmailSettings | null | undefined;
  env: {
    SMTP_HOST?: string | undefined;
    SMTP_PORT?: number | undefined;
    SMTP_SECURITY?: EmailSecurity | undefined;
    SMTP_USER?: string | undefined;
    SMTP_PASSWORD?: string | undefined;
    SMTP_FROM?: string | undefined;
  };
  authSecret: string;
}

export type MailSetup =
  | { ok: true; config: MailConfig; from: "settings" | "environment" }
  // secret-unreadable: the saved password was sealed under another AUTH_SECRET.
  // not-configured: no server anywhere, or the environment's is incomplete.
  | { ok: false; reason: "secret-unreadable" | "not-configured" };

// The usual security for a port when the environment doesn't say.
const securityFor = (port: number): EmailSecurity => (port === 465 ? "tls" : "starttls");

export function mailConfig({ settings, env, authSecret }: MailSources): MailSetup {
  if (settings) {
    const password = settings.password ? openPassword(settings.password, authSecret) : null;
    if (settings.password && password === null) return { ok: false, reason: "secret-unreadable" };
    return {
      ok: true,
      from: "settings",
      config: {
        host: settings.host,
        port: settings.port,
        security: settings.security,
        username: settings.username,
        password,
        from: { name: settings.fromName, address: settings.fromAddress },
      },
    };
  }
  const host = v.safeParse(SmtpHost, env.SMTP_HOST ?? "");
  const from = parseFrom(env.SMTP_FROM ?? "");
  if (!host.success || !from) return { ok: false, reason: "not-configured" };
  const port = v.is(SmtpPort, env.SMTP_PORT) ? (env.SMTP_PORT as number) : 587;
  return {
    ok: true,
    from: "environment",
    config: {
      host: host.output,
      port,
      security: env.SMTP_SECURITY ?? securityFor(port),
      username: env.SMTP_USER || null,
      password: env.SMTP_PASSWORD || null,
      from,
    },
  };
}
