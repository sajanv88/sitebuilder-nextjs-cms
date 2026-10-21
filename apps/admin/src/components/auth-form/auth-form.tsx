// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Button } from "@nuvui/react";
import type { ComponentProps, ReactNode } from "react";
import "./auth-form.scss";

// The form on an auth screen. The browser's own checks are off: the server's (and Better
// Auth's) are the ones that count, and their messages show in the fields.
export function AuthForm(props: Omit<ComponentProps<"form">, "className" | "noValidate">) {
  return <form {...props} noValidate className="auth-form" />;
}

export function AuthFormSubmit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button
      type="submit"
      size="lg"
      className="auth-form__submit"
      disabled={pending}
      aria-busy={pending}
    >
      {children}
    </Button>
  );
}
