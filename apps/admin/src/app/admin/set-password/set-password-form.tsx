// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  PasswordInput,
} from "@nuvui/react";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@sitebuilder/schema";
import { type FormEvent, useState } from "react";
import { authClient } from "@/auth/auth-client";
import { AuthForm, AuthFormSubmit } from "@/components/auth-form/auth-form";

// Posts the new password with the link's token to Better Auth's /api/auth/reset-password,
// which uses the token up and signs the account out everywhere else.
export function SetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const again = String(form.get("again") ?? "");
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setFieldError(`Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
      return;
    }
    if (password !== again) {
      setFieldError("The two don't match.");
      return;
    }
    setFieldError("");
    setError("");
    setState("pending");
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setState("idle");
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute, then try again."
          : "This link has expired or was already used. Ask for a new one.",
      );
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <Alert intent="success" role="status">
        <AlertDescription>
          Your password is set. <a href="/admin/sign-in">Sign in</a> with it.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <AuthForm onSubmit={submit}>
      {error ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>
            {error} <a href="/admin/forgot-password">Ask for a new link</a>.
          </AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>
          {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters. A few words you'll remember
          work well.
        </FieldDescription>
      </Field>
      <Field required>
        <FieldLabel>The same again</FieldLabel>
        <FieldControl>
          <PasswordInput name="again" autoComplete="new-password" />
        </FieldControl>
        <FieldError>{fieldError}</FieldError>
      </Field>
      <AuthFormSubmit pending={state === "pending"}>Set the password</AuthFormSubmit>
    </AuthForm>
  );
}
