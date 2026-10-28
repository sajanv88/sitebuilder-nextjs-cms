// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Alert, AlertDescription } from "@nuvui/react";
import { countUsers, db } from "@sitebuilder/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/auth/session";
import { AuthScreen } from "@/components/auth-screen/auth-screen";
import { currentMail } from "@/server/mail";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  if (await getViewer()) redirect("/admin");
  const { setup } = await searchParams;
  const [users, mail] = await Promise.all([countUsers(db), currentMail()]);
  const noUsers = users === 0;

  return (
    <AuthScreen title="Sign in" intro="Sign in to manage your site.">
      {setup === "done" ? (
        <Alert intent="success">
          <AlertDescription>
            Your site is set up. Sign in with the account you just created.
          </AlertDescription>
        </Alert>
      ) : null}
      {noUsers ? (
        <Alert intent="info">
          <AlertDescription>
            {/* /setup is served by this zone, but it's a full page load either way. */}
            This site has no accounts yet. <a href="/setup">Set it up</a> first.
          </AlertDescription>
        </Alert>
      ) : null}
      <SignInForm />
      {mail.ok ? (
        <p className="auth-screen__text">
          <a href="/admin/forgot-password">Forgot your password?</a>
        </p>
      ) : null}
    </AuthScreen>
  );
}
