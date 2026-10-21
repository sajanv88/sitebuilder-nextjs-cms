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
  Input,
  PasswordInput,
} from "@nuvui/react";
import { PASSWORD_MIN_LENGTH } from "@sitebuilder/schema";
import { useActionState } from "react";
import { AuthForm, AuthFormSubmit } from "@/components/auth-form/auth-form";
import { type SetupState, setupSite } from "./actions";

const initial: SetupState = { ok: true };

export function SetupForm() {
  const [state, action, pending] = useActionState(setupSite, initial);
  const errors = state.ok ? {} : (state.errors ?? {});
  const values = state.ok ? undefined : state.values;

  return (
    <AuthForm action={action}>
      {!state.ok && state.message ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Your name</FieldLabel>
        <FieldControl>
          <Input name="name" autoComplete="name" defaultValue={values?.name} />
        </FieldControl>
        <FieldError>{errors.name}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="email" defaultValue={values?.email} />
        </FieldControl>
        <FieldError>{errors.email}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
        <FieldError>{errors.password}</FieldError>
      </Field>
      <AuthFormSubmit pending={pending}>Create the admin account</AuthFormSubmit>
    </AuthForm>
  );
}
