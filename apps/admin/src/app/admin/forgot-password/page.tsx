// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Alert, AlertDescription } from "@nuvui/react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/auth/session";
import { AuthScreen } from "@/components/auth-screen/auth-screen";
import { currentMail } from "@/server/mail";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password?" };

// A link to choose a new password, by email (decisions #147). Without email set up, it says
// who can help instead.
export default async function ForgotPasswordPage() {
  if (await getViewer()) redirect("/admin");
  const mail = await currentMail();
  return (
    <AuthScreen
      title="Forgot your password?"
      intro="Enter your account's email address, and we'll send a link to choose a new password."
    >
      {mail.ok ? (
        <ForgotPasswordForm />
      ) : (
        <Alert intent="info">
          <AlertDescription>
            This site can't send email yet. Ask an admin to set a new password for you.
          </AlertDescription>
        </Alert>
      )}
      <p className="auth-screen__text">
        <a href="/admin/sign-in">Back to signing in</a>
      </p>
    </AuthScreen>
  );
}
