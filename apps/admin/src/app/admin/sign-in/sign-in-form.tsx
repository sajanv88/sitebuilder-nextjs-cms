"use client";

import {
  Alert,
  AlertDescription,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  PasswordInput,
} from "@nuvui/react";
import { SignInInput } from "@sitebuilder/schema";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import * as v from "valibot";
import { authClient } from "@/auth/auth-client";
import { AuthForm, AuthFormSubmit } from "@/components/auth-form/auth-form";

// Posts to Better Auth's /api/auth/sign-in/email, which checks the origin, rate-limits by IP and
// sets the session cookie. The message never says which of the two was wrong.
export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = v.safeParse(SignInInput, {
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!input.success) {
      setError("Enter your email address and password.");
      return;
    }
    setPending(true);
    const result = await authClient.signIn.email(input.output);
    if (result.error) {
      setPending(false);
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute, then try again."
          : "That email address and password don't match an account.",
      );
      return;
    }
    router.replace("/admin");
    router.refresh();
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
      <Field required>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="current-password" />
        </FieldControl>
      </Field>
      <AuthFormSubmit pending={pending}>Sign in</AuthFormSubmit>
    </AuthForm>
  );
}
