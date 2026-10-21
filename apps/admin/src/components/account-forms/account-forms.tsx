// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PasswordInput,
  toast,
} from "@nuvui/react";
import { PASSWORD_MIN_LENGTH } from "@sitebuilder/schema";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { type AccountState, changePassword, updateName } from "@/actions/account";
import "./account-forms.scss";

const idle: AccountState = { result: "idle" };

// Two forms, each in a card: the name, and the password.
export function AccountForms({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [nameState, nameAction, savingName] = useActionState(updateName, idle);
  const [passwordState, passwordAction, savingPassword] = useActionState(changePassword, idle);

  useEffect(() => {
    if (nameState.result === "saved" && nameState.savedAt) {
      toast(nameState.message ?? "Saved", { intent: "success", id: `name-${nameState.savedAt}` });
      // The sidebar shows the name: draw it again.
      router.refresh();
    }
  }, [nameState.result, nameState.message, nameState.savedAt, router]);
  useEffect(() => {
    if (passwordState.result === "saved" && passwordState.savedAt) {
      toast(passwordState.message ?? "Saved", {
        intent: "success",
        id: `password-${passwordState.savedAt}`,
      });
    }
  }, [passwordState.result, passwordState.message, passwordState.savedAt]);

  return (
    <div className="account-forms">
      <Card>
        <form action={nameAction} noValidate>
          <CardHeader>
            <CardTitle asChild>
              <h2>Your name</h2>
            </CardTitle>
            <CardDescription>
              Shown as the author of what you write. You sign in as {email}.
            </CardDescription>
          </CardHeader>
          <CardContent className="account-forms__fields">
            {nameState.result === "failed" ? (
              <Alert intent="danger" role="alert">
                <AlertDescription>{nameState.message}</AlertDescription>
              </Alert>
            ) : null}
            <Field required>
              <FieldLabel>Name</FieldLabel>
              <FieldControl>
                <Input name="name" autoComplete="name" defaultValue={name} />
              </FieldControl>
              <FieldError>{nameState.errors?.name}</FieldError>
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={savingName} aria-busy={savingName}>
              Save name
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <form action={passwordAction} noValidate>
          <CardHeader>
            <CardTitle asChild>
              <h2>Password</h2>
            </CardTitle>
            <CardDescription>Changing it signs you out everywhere else.</CardDescription>
          </CardHeader>
          <CardContent className="account-forms__fields">
            {passwordState.result === "failed" ? (
              <Alert intent="danger" role="alert">
                <AlertDescription>{passwordState.message}</AlertDescription>
              </Alert>
            ) : null}
            {/* For password managers: which account this password is for. */}
            <input type="text" name="email" autoComplete="username" value={email} readOnly hidden />
            <Field required>
              <FieldLabel>Current password</FieldLabel>
              <FieldControl>
                <PasswordInput name="currentPassword" autoComplete="current-password" />
              </FieldControl>
              <FieldError>{passwordState.errors?.currentPassword}</FieldError>
            </Field>
            <Field required>
              <FieldLabel>New password</FieldLabel>
              <FieldControl>
                <PasswordInput name="newPassword" autoComplete="new-password" />
              </FieldControl>
              <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
              <FieldError>{passwordState.errors?.newPassword}</FieldError>
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={savingPassword} aria-busy={savingPassword}>
              Change password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
