// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { PASSWORD_LINK_HOURS, type PasswordLinkEmail } from "@sitebuilder/auth/server";
import { db, getSettings } from "@sitebuilder/db";
import {
  inviteMessage,
  type MailSetup,
  mailConfig,
  resetMessage,
  sendMail,
} from "@sitebuilder/mail";
import { env } from "@/env";

// Email for this zone (decisions #147): the server from Settings → Email or the environment,
// read per call so a change in Settings applies to the next email.

export async function currentMail(): Promise<MailSetup> {
  const config = env();
  return mailConfig({
    settings: await getSettings(db, "email"),
    env: config,
    authSecret: config.AUTH_SECRET,
  });
}

// Better Auth's password links: a reset someone asked for, or a link an admin sent. A failure
// on an admin's send is thrown, so their screen can say so; on the public form it's only logged
// (Better Auth answers the same either way, and so must this).
export async function sendPasswordLink({
  user,
  url,
  invitation,
  fromAdmin,
}: PasswordLinkEmail): Promise<void> {
  const failed = (why: string) => {
    if (fromAdmin) throw new MailFailure(why);
    console.error(`email: a password link wasn't sent: ${why}`);
  };
  const setup = await currentMail();
  if (!setup.ok) {
    failed(
      setup.reason === "secret-unreadable"
        ? "the saved SMTP password can't be read (AUTH_SECRET changed); enter it again in Settings, Email"
        : "email isn't set up",
    );
    return;
  }
  const site = await getSettings(db, "site");
  const details = {
    siteTitle: site?.title ?? "your site",
    name: user.name,
    url,
    hours: PASSWORD_LINK_HOURS,
  };
  const sent = await sendMail(
    setup.config,
    user.email,
    invitation ? inviteMessage(details) : resetMessage(details),
  );
  if (!sent.ok) failed(sent.message);
}

// Why an admin's email didn't go, in words for the screen.
export class MailFailure extends Error {
  override readonly name = "MailFailure";
}

// The message of a MailFailure, however Better Auth passed it on.
export function mailFailureOf(error: unknown): string | null {
  for (let cause: unknown = error; cause; cause = (cause as { cause?: unknown }).cause) {
    if (cause instanceof MailFailure) return cause.message;
  }
  return null;
}
