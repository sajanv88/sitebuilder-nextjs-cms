// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { Alert, AlertDescription, Field, FieldControl, FieldLabel, Input } from "@nuvui/react";
import { Email } from "@sitebuilder/schema";
import { type FormEvent, useState } from "react";
import * as v from "valibot";
import { authClient } from "@/auth/auth-client";
import { AuthForm, AuthFormSubmit } from "@/components/auth-form/auth-form";

// Posts to Better Auth's /api/auth/request-password-reset, which checks the origin and limits
// the requests. The answer is the same whether or not the address has an account.
export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = v.safeParse(Email, new FormData(event.currentTarget).get("email"));
    if (!email.success) {
      setError("Enter your email address.");
      return;
    }
    setError("");
    setState("pending");
    const result = await authClient.requestPasswordReset({
      email: email.output,
      redirectTo: "/admin/set-password",
    });
    if (result.error) {
      setState("idle");
      setError(
        result.error.status === 429
          ? "Too many requests. Wait a few minutes, then try again."
          : "The link couldn't be sent. Try again in a moment.",
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <Alert intent="success" role="status">
        <AlertDescription>
          If an account uses that address, a link is on its way. It works once, for a day.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <AuthForm onSubmit={submit}>
      {error ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="email" />
        </FieldControl>
      </Field>
      <AuthFormSubmit pending={state === "pending"}>Send the link</AuthFormSubmit>
    </AuthForm>
  );
}
