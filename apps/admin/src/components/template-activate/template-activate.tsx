// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  CheckboxCard,
  ChoiceCardDescription,
  ChoiceCardTitle,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateTemplate,
  previewTemplateActivation,
  type TemplatePreview,
} from "@/actions/templates";
import "./template-activate.scss";

// Applying a template (docs/templates_and_ai_design.md A7): a dialog that first asks the server
// what it would do (a dry run), then lets the admin choose what to bring. Starter pages are
// drafts unless "Publish them now" is ticked.

type Choice = "theme" | "starter" | "menus" | "home" | "publish";

const STATE_LABEL = { new: null, added: "Already added", trashed: "In the trash" } as const;

export function TemplateActivate({
  slug,
  name,
  active,
}: {
  slug: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [choices, setChoices] = useState<Record<Choice, boolean>>({
    theme: true,
    starter: true,
    menus: false,
    home: false,
    publish: false,
  });
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setPreview(null);
    startLoading(async () => {
      const result = await previewTemplateActivation(slug);
      setPreview(result);
      if (result.ok) {
        const fresh = result.entries.some((entry) => entry.state === "new");
        setChoices({
          theme: result.hasTheme,
          starter: fresh,
          menus: false,
          home: false,
          publish: false,
        });
      }
    });
  }

  const set = (choice: Choice) => (checked: boolean | "indeterminate") =>
    setChoices((now) => ({ ...now, [choice]: checked === true }));

  function apply() {
    startSaving(async () => {
      const result = await activateTemplate({ slug, ...choices });
      if (!result.ok) {
        toast(result.error, { intent: "danger" });
        return;
      }
      // What was made, by kind: every new entry in the dry run is created when one is.
      const made = result.created > 0 ? fresh : [];
      const count = (type: "page" | "post", one: string, many: string) => {
        const n = made.filter((entry) => entry.type === type).length;
        return n === 0 ? null : `${n} ${n === 1 ? one : many}`;
      };
      const what = [count("page", "page", "pages"), count("post", "post", "posts")].filter(Boolean);
      toast(
        what.length > 0
          ? `${name} is in use. ${what.join(" and ")} ${choices.publish ? "published" : "added as drafts"}.`
          : `${name} is in use.`,
        { intent: "success" },
      );
      setOpen(false);
      router.refresh();
    });
  }

  const ready = preview?.ok ? preview : null;
  const fresh = ready?.entries.filter((entry) => entry.state === "new") ?? [];
  const anything = Object.entries(choices).some(([key, on]) => on && key !== "publish") || !active;

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button intent={active ? "secondary" : "primary"}>
          {active ? "Apply again" : `Use ${name}`}
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Use {name}?</DialogTitle>
          <DialogDescription>
            Choose what it brings. Pages and posts you've written stay as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {loading || !preview ? (
            <p className="template-activate__wait" role="status">
              <Spinner size="sm" label="" /> Checking what it would add
            </p>
          ) : !preview.ok ? (
            <Alert intent="danger">
              <AlertDescription>{preview.error}</AlertDescription>
            </Alert>
          ) : (
            <div className="template-activate__body">
              <fieldset className="template-activate__choices">
                <legend className="template-activate__legend">What to bring</legend>
                {preview.hasTheme ? (
                  <CheckboxCard
                    checked={choices.theme}
                    onCheckedChange={set("theme")}
                    indicator="end"
                  >
                    <ChoiceCardTitle>Its colours and type</ChoiceCardTitle>
                    <ChoiceCardDescription>
                      Replaces the theme in Appearance. You can change it there afterwards.
                    </ChoiceCardDescription>
                  </CheckboxCard>
                ) : null}
                {preview.entries.length > 0 ? (
                  <CheckboxCard
                    checked={choices.starter}
                    onCheckedChange={set("starter")}
                    disabled={fresh.length === 0}
                    indicator="end"
                  >
                    <ChoiceCardTitle>Its starter pages</ChoiceCardTitle>
                    <ChoiceCardDescription>
                      {fresh.length === 0
                        ? "Every one has been added before."
                        : `${fresh.length} to add, listed below, with placeholder words to replace.`}
                    </ChoiceCardDescription>
                  </CheckboxCard>
                ) : null}
                {preview.hasMenus ? (
                  <CheckboxCard
                    checked={choices.menus}
                    onCheckedChange={set("menus")}
                    indicator="end"
                  >
                    <ChoiceCardTitle>Its menus</ChoiceCardTitle>
                    <ChoiceCardDescription>
                      Replaces the main and footer menus with links to its pages.
                    </ChoiceCardDescription>
                  </CheckboxCard>
                ) : null}
                {preview.home ? (
                  <CheckboxCard
                    checked={choices.home}
                    onCheckedChange={set("home")}
                    indicator="end"
                  >
                    <ChoiceCardTitle>Its home page</ChoiceCardTitle>
                    <ChoiceCardDescription>
                      {preview.home === "posts"
                        ? "Shows the latest posts first, as this template is meant to."
                        : "Makes its home page the one visitors see first, once it's published."}
                    </ChoiceCardDescription>
                  </CheckboxCard>
                ) : null}
                {fresh.length > 0 ? (
                  <CheckboxCard
                    checked={choices.publish && choices.starter}
                    onCheckedChange={set("publish")}
                    disabled={!choices.starter}
                    indicator="end"
                  >
                    <ChoiceCardTitle>Publish them now</ChoiceCardTitle>
                    <ChoiceCardDescription>
                      Off, they're drafts that only you can see until each is published.
                    </ChoiceCardDescription>
                  </CheckboxCard>
                ) : null}
              </fieldset>

              {preview.entries.length > 0 ? (
                <section className="template-activate__entries" aria-labelledby={`${slug}-entries`}>
                  <h3 id={`${slug}-entries`} className="template-activate__legend">
                    Its pages and posts
                  </h3>
                  <ul className="template-activate__list">
                    {preview.entries.map((entry) => (
                      <li key={entry.ref} className="template-activate__entry">
                        <span className="template-activate__title">
                          {entry.title}
                          <span className="template-activate__path">
                            {entry.path}
                            {entry.numbered ? ", which is taken: it gets a number" : ""}
                          </span>
                        </span>
                        {STATE_LABEL[entry.state] ? (
                          <Badge>{STATE_LABEL[entry.state]}</Badge>
                        ) : (
                          <Badge intent="primary" variant="outline">
                            {entry.type === "post" ? "New post" : "New page"}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button intent="secondary">Cancel</Button>
          </DialogClose>
          <Button disabled={!ready || saving || !anything} aria-busy={saving} onClick={apply}>
            {saving ? "Applying" : `Use ${name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
