// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Alert, AlertDescription } from "@nuvui/react";
import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth-screen/auth-screen";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password" };

// Where a password link lands (decisions #147): Better Auth checked the token and passes it on,
// or says it's no good. An invitation's link adds welcome=1.
export default async function SetPasswordPage({ searchParams }: PageProps<"/admin/set-password">) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const welcome = query.welcome === "1";
  const usable = /^[A-Za-z0-9_-]{16,128}$/.test(token) && !query.error;
  return (
    <AuthScreen
      title={welcome ? "Choose your password" : "Choose a new password"}
      intro={
        welcome
          ? "Your account is ready: choose the password you'll sign in with."
          : "Choose the password you'll sign in with from now on."
      }
    >
      {usable ? (
        <SetPasswordForm token={token} />
      ) : (
        <Alert intent="warning" role="alert">
          <AlertDescription>
            This link has expired or was already used.{" "}
            <a href="/admin/forgot-password">Ask for a new one</a>.
          </AlertDescription>
        </Alert>
      )}
    </AuthScreen>
  );
}
