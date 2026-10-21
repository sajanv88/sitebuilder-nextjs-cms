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
  ChoiceCardDescription,
  ChoiceCardTitle,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NumberField,
  RadioCard,
  RadioGroup,
  toast,
} from "@nuvui/react";
import { DATE_FORMATS, type DateFormat, formatDate } from "@sitebuilder/schema";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type DateFormValues,
  type ReadingFormValues,
  type SettingsFormState,
  type SiteFormValues,
  saveDateSettings,
  saveReading,
  saveSiteSettings,
} from "@/actions/settings";
import { LATEST_POSTS } from "@/lib/reading";
import "./settings-forms.scss";

// The Site, Reading and Dates sections of Settings (design §5.4). Each is its own form with its
// own Save; what's typed stays when a save is refused.

function useSavedToast(state: SettingsFormState<Record<string, string>>, key: string) {
  useEffect(() => {
    if (state.result === "saved" && state.message && state.at) {
      toast(state.message, { intent: "success", id: `${key}-${state.at}` });
    }
  }, [state, key]);
}

function Problem({ state }: { state: SettingsFormState<Record<string, string>> }) {
  if (state.result !== "failed" && state.result !== "invalid") return null;
  return (
    <Alert intent={state.result === "invalid" ? "warning" : "danger"} role="alert">
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

// ── Site ─────────────────────────────────────────────────────────────────────────────────────

export function SiteForm({ initial }: { initial: SiteFormValues }) {
  const [state, save, saving] = useActionState(saveSiteSettings, {
    result: "idle",
    values: initial,
  });
  useSavedToast(state, "site");
  const { values, errors = {} } = state;
  return (
    <form action={save} className="settings-forms" noValidate>
      <Problem state={state} />
      <Field required>
        <FieldLabel>Site title</FieldLabel>
        <FieldControl>
          <Input name="title" defaultValue={values.title} maxLength={120} />
        </FieldControl>
        <FieldDescription>In the header, the footer and every page's title.</FieldDescription>
        <FieldError>{errors.title}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Tagline</FieldLabel>
        <FieldControl>
          <Input name="tagline" defaultValue={values.tagline} maxLength={200} />
        </FieldControl>
        <FieldDescription>
          A line about the site, for the footer and search results.
        </FieldDescription>
        <FieldError>{errors.tagline}</FieldError>
      </Field>
      <div className="settings-forms__pair">
        <Field required>
          <FieldLabel>Language</FieldLabel>
          <FieldControl>
            <Input name="language" defaultValue={values.language} spellCheck={false} />
          </FieldControl>
          <FieldDescription>A language tag, such as en, nl or en-GB.</FieldDescription>
          <FieldError>{errors.language}</FieldError>
        </Field>
        <Field required>
          <FieldLabel>Site address</FieldLabel>
          <FieldControl>
            <Input name="siteUrl" type="url" defaultValue={values.siteUrl} spellCheck={false} />
          </FieldControl>
          <FieldDescription>
            The address visitors use. Search engines and feeds are given it.
          </FieldDescription>
          <FieldError>{errors.siteUrl}</FieldError>
        </Field>
      </div>
      <Button type="submit" className="settings-forms__submit" disabled={saving} aria-busy={saving}>
        Save site settings
      </Button>
    </form>
  );
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────

export function ReadingForm({
  initial,
  pages,
}: {
  initial: ReadingFormValues;
  // Published pages, which can be the home page.
  pages: { id: string; title: string; path: string }[];
}) {
  const [state, save, saving] = useActionState(saveReading, { result: "idle", values: initial });
  useSavedToast(state, "reading");
  const [homepage, setHomepage] = useState(initial.homepage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const { values, errors = {} } = state;

  useEffect(() => {
    if (state.result === "confirm") setConfirmOpen(true);
    // After the form's reset, as in DatesForm.
    if (state.result === "saved") setHomepage(state.values.homepage);
  }, [state]);

  function moveAnyway() {
    const path = form.current?.elements.namedItem("postsPath");
    if (confirm.current && path instanceof HTMLInputElement) confirm.current.value = path.value;
    setConfirmOpen(false);
    form.current?.requestSubmit(submit.current);
  }

  const chosen = pages.find((page) => page.id === homepage);
  return (
    <form ref={form} action={save} className="settings-forms" noValidate>
      <input ref={confirm} type="hidden" name="confirm" defaultValue="" />
      <Problem state={state} />
      <Field>
        <FieldLabel>Home page</FieldLabel>
        <Combobox name="homepage" value={homepage} onValueChange={setHomepage}>
          <FieldControl>
            <ComboboxTrigger>
              <ComboboxValue>
                {chosen ? `${chosen.title} (${chosen.path})` : "The latest posts"}
              </ComboboxValue>
            </ComboboxTrigger>
          </FieldControl>
          <ComboboxContent label="Search pages" searchPlaceholder="Search published pages">
            <ComboboxEmpty>No published page found.</ComboboxEmpty>
            <ComboboxItem value={LATEST_POSTS}>The latest posts</ComboboxItem>
            {pages.map((page) => (
              <ComboboxItem key={page.id} value={page.id} keywords={[page.path]}>
                {`${page.title} (${page.path})`}
              </ComboboxItem>
            ))}
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          What visitors see at the site's address. A published page, or the latest posts.
        </FieldDescription>
        <FieldError>{errors.homepage}</FieldError>
      </Field>
      <div className="settings-forms__pair">
        <Field required>
          <FieldLabel>Posts per page</FieldLabel>
          <FieldControl>
            <NumberField
              name="postsPerPage"
              defaultValue={Number(values.postsPerPage) || 10}
              min={1}
              max={50}
            />
          </FieldControl>
          <FieldDescription>On the blog and its archives, 1 to 50.</FieldDescription>
          <FieldError>{errors.postsPerPage}</FieldError>
        </Field>
        <Field required>
          <FieldLabel>Posts address</FieldLabel>
          <FieldControl>
            <Input name="postsPath" defaultValue={values.postsPath} spellCheck={false} />
          </FieldControl>
          <FieldDescription>
            Where the blog lives, such as /blog. Posts go under it.
          </FieldDescription>
          <FieldError>{errors.postsPath}</FieldError>
        </Field>
      </div>
      <Button
        ref={submit}
        type="submit"
        className="settings-forms__submit"
        disabled={saving}
        aria-busy={saving}
      >
        Save reading settings
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Move every post?</AlertDialogTitle>
          <AlertDialogDescription>
            {state.moving === 1 ? "1 post moves" : `${state.moving ?? 0} posts move`} to the new
            address. Each published one gets a redirect from its old address, so links to it keep
            working.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the old address</AlertDialogCancel>
            <AlertDialogAction onClick={moveAnyway}>Move the posts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// ── Dates ────────────────────────────────────────────────────────────────────────────────────

// One moment, written in each format, so the choice shows what it means.
const EXAMPLE = new Date(Date.UTC(2026, 11, 31, 12));

export function DatesForm({
  initial,
  zones,
  language,
}: {
  initial: DateFormValues;
  zones: string[];
  language: string;
}) {
  const [state, save, saving] = useActionState(saveDateSettings, {
    result: "idle",
    values: initial,
  });
  useSavedToast(state, "dates");
  const [format, setFormat] = useState(initial.dateFormat);
  const [zone, setZone] = useState(initial.timeZone);
  // React resets a form after its action, and the controlled choices follow the reset back to
  // their first values: put the saved ones back.
  useEffect(() => {
    if (state.result !== "saved") return;
    setFormat(state.values.dateFormat);
    setZone(state.values.timeZone);
  }, [state]);
  const { errors = {} } = state;
  return (
    <form action={save} className="settings-forms" noValidate>
      <Problem state={state} />
      <div className="settings-forms__choices">
        <span id="settings-date-format" className="settings-forms__label">
          Date format
        </span>
        <RadioGroup
          name="dateFormat"
          value={format}
          onValueChange={setFormat}
          aria-labelledby="settings-date-format"
          className="settings-forms__cards"
        >
          {DATE_FORMATS.map((option: DateFormat) => (
            <RadioCard key={option} value={option}>
              <ChoiceCardTitle>
                {formatDate(EXAMPLE, { dateFormat: option, timeZone: "UTC" }, language)}
              </ChoiceCardTitle>
              <ChoiceCardDescription>
                {option === "MM/dd/yyyy" ? "Month first. Weeks start on Sunday." : null}
                {option === "dd/MM/yyyy" ? "Day first. Weeks start on Monday." : null}
                {option === "yyyy-MM-dd" ? "Year first (ISO). Weeks start on Monday." : null}
                {option === "d MMMM yyyy" ? "The month written out. Weeks start on Monday." : null}
              </ChoiceCardDescription>
            </RadioCard>
          ))}
        </RadioGroup>
        {errors.dateFormat ? <p className="settings-forms__error">{errors.dateFormat}</p> : null}
      </div>
      <Field required>
        <FieldLabel>Time zone</FieldLabel>
        <Combobox name="timeZone" value={zone} onValueChange={setZone}>
          <FieldControl>
            <ComboboxTrigger>
              <ComboboxValue placeholder="Choose a time zone" />
            </ComboboxTrigger>
          </FieldControl>
          <ComboboxContent label="Search time zones" searchPlaceholder="Type a city, such as Paris">
            <ComboboxEmpty>No time zone found.</ComboboxEmpty>
            {zones.map((name) => (
              <ComboboxItem key={name} value={name} keywords={[name.replaceAll("_", " ")]}>
                {name}
              </ComboboxItem>
            ))}
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          Post dates on the site and every date in the admin are shown in it, and publish times are
          picked in it.
        </FieldDescription>
        <FieldError>{errors.timeZone}</FieldError>
      </Field>
      <Button type="submit" className="settings-forms__submit" disabled={saving} aria-busy={saving}>
        Save date settings
      </Button>
    </form>
  );
}
