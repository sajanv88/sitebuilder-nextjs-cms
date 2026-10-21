// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Checkbox,
  ChoiceCardDescription,
  ChoiceCardTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PasswordInput,
  RadioCard,
  RadioGroup,
  toast,
} from "@nuvui/react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type StorageFormState,
  type StorageFormValues,
  saveStorage,
  testStorage,
} from "@/actions/media-storage";
import "./media-storage-form.scss";

export interface EnvironmentSummary {
  driver: "local" | "s3";
  // A folder for local storage; "bucket at endpoint" for S3. Never a key.
  where: string;
}

// Settings → Media storage (decisions #45). The environment is the default; an admin can choose
// the server's disk or an S3-compatible bucket of their own instead.
export function MediaStorageForm({
  initial,
  environment,
  secret,
}: {
  initial: StorageFormValues;
  environment: EnvironmentSummary;
  // Whether a saved S3 secret exists, and whether it can still be read.
  secret: "none" | "saved" | "unreadable";
}) {
  const [saved, save, saving] = useActionState(saveStorage, { result: "idle", values: initial });
  const [tested, test, testing] = useActionState(testStorage, { result: "idle", values: initial });
  const [driver, setDriver] = useState(initial.driver);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  // Whichever of Test and Save answered last is shown; the fields keep what was typed.
  const latest: StorageFormState = (tested.at ?? 0) > (saved.at ?? 0) ? tested : saved;
  const values = latest.values;
  const errors = latest.errors ?? {};
  const busy = saving || testing;

  useEffect(() => {
    if (saved.result === "saved" && saved.message && saved.at) {
      toast(saved.message, { intent: "success", id: `storage-${saved.at}` });
      // React resets the form after its action, and the choice follows the reset back to its
      // first value: put the saved one back.
      setDriver(saved.values.driver);
    }
    if (saved.result === "confirm") setConfirmOpen(true);
  }, [saved]);

  function saveAnyway() {
    if (confirm.current) confirm.current.value = "1";
    setConfirmOpen(false);
    form.current?.requestSubmit(saveButton.current);
  }

  return (
    <form ref={form} action={save} className="media-storage-form" noValidate>
      <input ref={confirm} type="hidden" name="confirm" defaultValue="" />
      <div className="media-storage-form__choices">
        <span id="media-storage-driver" className="media-storage-form__label">
          Where uploads go
        </span>
        <RadioGroup
          name="driver"
          value={driver}
          onValueChange={(value) => setDriver(value as StorageFormValues["driver"])}
          aria-labelledby="media-storage-driver"
          className="media-storage-form__cards"
        >
          <RadioCard value="environment">
            <ChoiceCardTitle>The server's configuration</ChoiceCardTitle>
            <ChoiceCardDescription>
              {environment.driver === "local"
                ? `The server's disk, in ${environment.where}.`
                : `S3-compatible storage: ${environment.where}.`}{" "}
              Set by whoever runs the site, with environment variables.
            </ChoiceCardDescription>
          </RadioCard>
          <RadioCard value="local">
            <ChoiceCardTitle>The server's disk</ChoiceCardTitle>
            <ChoiceCardDescription>
              Simple, and fine for one server. On Kubernetes or Vercel a disk doesn't last: use S3
              there.
            </ChoiceCardDescription>
          </RadioCard>
          <RadioCard value="s3">
            <ChoiceCardTitle>S3-compatible storage</ChoiceCardTitle>
            <ChoiceCardDescription>
              Your own bucket on MinIO, Cloudflare R2, AWS S3 or similar. It can stay private:
              visitors get files through this site.
            </ChoiceCardDescription>
          </RadioCard>
        </RadioGroup>
      </div>

      {driver === "s3" ? (
        <div className="media-storage-form__s3">
          <Field required>
            <FieldLabel>Endpoint</FieldLabel>
            <FieldControl>
              <Input
                name="endpoint"
                type="url"
                defaultValue={values.endpoint}
                placeholder="https://minio.example.com"
                spellCheck={false}
              />
            </FieldControl>
            <FieldDescription>The storage's address, starting with https://.</FieldDescription>
            <FieldError>{errors.endpoint}</FieldError>
          </Field>
          <div className="media-storage-form__pair">
            <Field required>
              <FieldLabel>Bucket</FieldLabel>
              <FieldControl>
                <Input name="bucket" defaultValue={values.bucket} spellCheck={false} />
              </FieldControl>
              <FieldError>{errors.bucket}</FieldError>
            </Field>
            <Field required>
              <FieldLabel>Region</FieldLabel>
              <FieldControl>
                <Input
                  name="region"
                  defaultValue={values.region || "us-east-1"}
                  spellCheck={false}
                />
              </FieldControl>
              <FieldDescription>
                MinIO uses us-east-1 unless set otherwise; R2 uses auto.
              </FieldDescription>
              <FieldError>{errors.region}</FieldError>
            </Field>
          </div>
          <Field required>
            <FieldLabel>Access key id</FieldLabel>
            <FieldControl>
              <Input
                name="accessKeyId"
                defaultValue={values.accessKeyId}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldControl>
            <FieldError>{errors.accessKeyId}</FieldError>
          </Field>
          <Field required={secret !== "saved"}>
            <FieldLabel>Secret access key</FieldLabel>
            <FieldControl>
              <PasswordInput
                name="secret"
                autoComplete="new-password"
                showLabel="Show key"
                hideLabel="Hide key"
              />
            </FieldControl>
            <FieldDescription>
              {secret === "saved"
                ? "A key is saved. Leave this empty to keep it."
                : secret === "unreadable"
                  ? "The saved key can't be read any more (the server's secret changed). Enter it again."
                  : "Stored encrypted, and never shown again."}
            </FieldDescription>
            <FieldError>{errors.secret}</FieldError>
          </Field>
          <Field orientation="horizontal">
            <FieldControl>
              <Checkbox name="pathStyle" defaultChecked={values.pathStyle} />
            </FieldControl>
            <FieldLabel>Path-style addresses</FieldLabel>
            <FieldDescription>
              The bucket goes in the path, not the host name. MinIO needs this; R2 and AWS work
              either way.
            </FieldDescription>
          </Field>
        </div>
      ) : null}

      {latest.result === "invalid" || latest.result === "failed" ? (
        <Alert intent={latest.result === "invalid" ? "warning" : "danger"} role="alert">
          <AlertDescription>{latest.message}</AlertDescription>
        </Alert>
      ) : latest.result === "tested" ? (
        <Alert intent="success" role="status">
          <AlertDescription>{latest.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="media-storage-form__actions">
        <Button
          type="submit"
          formAction={test}
          intent="secondary"
          disabled={busy}
          aria-busy={testing}
        >
          Test connection
        </Button>
        <Button ref={saveButton} type="submit" disabled={busy} aria-busy={saving}>
          Save
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Some files would stop loading</AlertDialogTitle>
          <AlertDialogDescription>
            {saved.result === "confirm" ? saved.message : ""}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction intent="danger" onClick={saveAnyway}>
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
