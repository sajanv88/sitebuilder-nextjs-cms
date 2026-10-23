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
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Fieldset,
  FieldsetLegend,
  RadioGroup,
  RadioGroupItem,
  toast,
} from "@nuvui/react";
import type { TemplateOption, TemplateOptionValues } from "@sitebuilder/schema";
import { useActionState, useEffect, useId, useState } from "react";
import { saveTemplateOptions } from "@/actions/templates";
import "./template-options.scss";

// The active template's options (design §14): on or off, or one of a few choices, saved
// together. They change every public page, and the editor's canvas, at once.

export function TemplateOptions({
  slug,
  name,
  options,
  initial,
}: {
  slug: string;
  name: string;
  options: readonly TemplateOption[];
  // The values the site is drawn with now.
  initial: TemplateOptionValues;
}) {
  const [state, save, saving] = useActionState(saveTemplateOptions, { result: "idle" });
  const id = useId();
  // The choices are controlled: React resets a form after its action, and they'd follow the
  // reset back to the values they started with. The saved ones are put back.
  const saved = state.result === "saved" ? state.values : initial;
  const [choices, setChoices] = useState(initial);
  useEffect(() => {
    if (state.result !== "saved") return;
    setChoices(state.values);
    toast(state.message, { intent: "success", id: `template-options-${state.at}` });
  }, [state]);

  return (
    <Card className="template-options">
      <CardHeader>
        <CardTitle asChild>
          <h2>{`${name}'s options`}</h2>
        </CardTitle>
        <CardDescription>
          How the template draws every page. A change shows on the site, and in the editor, once
          it's saved.
        </CardDescription>
      </CardHeader>
      <form action={save} noValidate>
        <input type="hidden" name="slug" value={slug} />
        <CardContent className="template-options__fields">
          {state.result === "failed" ? (
            <Alert intent="danger" role="alert">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {options.map((option) =>
            option.type === "boolean" ? (
              <Field key={option.key} orientation="horizontal">
                <FieldControl>
                  {/* Keyed on the saved value, so the form's reset after a save leaves it. */}
                  <Checkbox
                    key={String(saved[option.key])}
                    name={option.key}
                    defaultChecked={saved[option.key] === true}
                  />
                </FieldControl>
                <FieldLabel>{option.label}</FieldLabel>
                {option.description ? (
                  <FieldDescription>{option.description}</FieldDescription>
                ) : null}
              </Field>
            ) : (
              <Fieldset key={option.key} className="template-options__choice">
                <FieldsetLegend>{option.label}</FieldsetLegend>
                {option.description ? (
                  <p className="template-options__note">{option.description}</p>
                ) : null}
                <RadioGroup
                  name={option.key}
                  value={String(choices[option.key] ?? option.default)}
                  onValueChange={(value) => setChoices((now) => ({ ...now, [option.key]: value }))}
                >
                  {option.choices.map((choice) => {
                    const itemId = `${id}-${option.key}-${choice.value}`;
                    return (
                      <div key={choice.value} className="template-options__radio">
                        <RadioGroupItem value={choice.value} id={itemId} />
                        <label htmlFor={itemId}>{choice.label}</label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </Fieldset>
            ),
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving} aria-busy={saving}>
            Save options
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
