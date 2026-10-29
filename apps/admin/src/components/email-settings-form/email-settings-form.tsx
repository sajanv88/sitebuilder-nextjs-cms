// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  Button,
  ChoiceCardDescription,
  ChoiceCardTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  PasswordInput,
  RadioCard,
  RadioGroup,
  toast,
} from "@nuvui/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { type EmailFormState, type EmailFormValues, saveEmail } from "@/actions/email";
import "./email-settings-form.scss";

// Settings → Email (decisions #147): where password links are sent from. A server is checked
// before it's saved.

export function EmailSettingsForm({
  initial,
  environment,
  password,
}: {
  initial: EmailFormValues;
  // What the SMTP_* variables set up, in words, or null when they don't.
  environment: string | null;
  // Whether a saved password exists, and whether it can still be read.
  password: "none" | "saved" | "unreadable";
}) {
  const [state, save, saving] = useActionState(saveEmail, {
    result: "idle",
    values: initial,
  } satisfies EmailFormState);
  const [source, setSource] = useState(initial.source);
  const security = useRef<HTMLSelectElement>(null);
  const { values, errors = {} } = state;

  useEffect(() => {
    if (state.result === "saved" && state.message && state.at) {
      toast(state.message, { intent: "success", id: `email-${state.at}` });
      // After the form's reset, as in the other settings forms.
      setSource(state.values.source);
      // The reset puts a select on its first option, not its defaultValue, and the next save
      // would send that.
      if (security.current) security.current.value = state.values.security;
    }
  }, [state]);

  return (
    <form action={save} className="email-settings-form" noValidate>
      {state.result === "failed" || state.result === "invalid" ? (
        <Alert intent={state.result === "invalid" ? "warning" : "danger"} role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="email-settings-form__choices">
        <span id="email-source" className="email-settings-form__label">
          Send email through
        </span>
        <RadioGroup
          name="source"
          value={source}
          onValueChange={setSource}
          aria-labelledby="email-source"
          className="email-settings-form__cards"
        >
          <RadioCard value="environment">
            <ChoiceCardTitle>The server's environment</ChoiceCardTitle>
            <ChoiceCardDescription>
              {environment ?? "Not set up: no SMTP_HOST and SMTP_FROM. No email is sent."}
            </ChoiceCardDescription>
          </RadioCard>
          <RadioCard value="smtp">
            <ChoiceCardTitle>An SMTP server</ChoiceCardTitle>
            <ChoiceCardDescription>
              Your provider's: Postmark, Amazon SES, Mailgun, Google Workspace or your own.
            </ChoiceCardDescription>
          </RadioCard>
        </RadioGroup>
      </div>

      {source === "smtp" ? (
        <div className="email-settings-form__details">
          <div className="email-settings-form__pair">
            <Field required>
              <FieldLabel>Server</FieldLabel>
              <FieldControl>
                <Input
                  name="host"
                  defaultValue={values.host}
                  placeholder="smtp.example.com"
                  spellCheck={false}
                />
              </FieldControl>
              <FieldError>{errors.host}</FieldError>
            </Field>
            <div className="email-settings-form__pair">
              <Field required>
                <FieldLabel>Port</FieldLabel>
                <FieldControl>
                  <Input name="port" defaultValue={values.port} inputMode="numeric" />
                </FieldControl>
                <FieldError>{errors.port}</FieldError>
              </Field>
              <Field>
                <FieldLabel>Security</FieldLabel>
                <FieldControl>
                  <NativeSelect ref={security} name="security" defaultValue={values.security}>
                    <option value="starttls">STARTTLS (usually 587)</option>
                    <option value="tls">TLS (usually 465)</option>
                    <option value="none">None: a relay on this network only</option>
                  </NativeSelect>
                </FieldControl>
              </Field>
            </div>
          </div>
          <div className="email-settings-form__pair">
            <Field>
              <FieldLabel>User name</FieldLabel>
              <FieldControl>
                <Input
                  name="username"
                  defaultValue={values.username}
                  autoComplete="off"
                  spellCheck={false}
                />
              </FieldControl>
              <FieldDescription>
                Empty for a server that takes email without signing in.
              </FieldDescription>
              <FieldError>{errors.username}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Password</FieldLabel>
              <FieldControl>
                <PasswordInput name="password" autoComplete="new-password" />
              </FieldControl>
              <FieldDescription>
                {password === "saved"
                  ? "A password is saved. Leave this empty to keep it."
                  : password === "unreadable"
                    ? "The saved password can't be read any more (the server's secret changed). Enter it again."
                    : "Stored encrypted, and never shown again."}
              </FieldDescription>
              <FieldError>{errors.password}</FieldError>
            </Field>
          </div>
          <div className="email-settings-form__pair">
            <Field>
              <FieldLabel>Sender's name</FieldLabel>
              <FieldControl>
                <Input name="fromName" defaultValue={values.fromName} />
              </FieldControl>
              <FieldDescription>Such as the site's name.</FieldDescription>
              <FieldError>{errors.fromName}</FieldError>
            </Field>
            <Field required>
              <FieldLabel>Sender's address</FieldLabel>
              <FieldControl>
                <Input
                  type="email"
                  name="fromAddress"
                  defaultValue={values.fromAddress}
                  placeholder="hello@example.com"
                />
              </FieldControl>
              <FieldDescription>One your provider lets this server send from.</FieldDescription>
              <FieldError>{errors.fromAddress}</FieldError>
            </Field>
          </div>
        </div>
      ) : null}

      <p className="email-settings-form__note">
        Used for password reset links and for inviting new users. Saving connects and signs in to
        check the server; no email is sent.
      </p>
      <Button
        type="submit"
        className="email-settings-form__submit"
        disabled={saving}
        aria-busy={saving}
      >
        Save email settings
      </Button>
    </form>
  );
}
