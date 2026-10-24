// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerHue,
  ColorPickerInput,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Textarea,
} from "@nuvui/react";
import { ENTRY_LIMITS, type EntryKind } from "@sitebuilder/schema";
import { type ReactNode, useId, useState } from "react";
import { BACKGROUND_PRESETS } from "@/components/appearance-form/brand";
import { MediaInput } from "@/components/block-fields/block-fields";
import type {
  EditorEntry,
  EditorField,
  EditorValues,
} from "@/components/entry-editor/editor-state";
import { TermPicker } from "@/components/term-picker/term-picker";
import "./entry-settings.scss";

// A post's or page's own settings, beside its blocks: publishing, address, author, terms, the
// featured image, the excerpt and what search engines show. Every field stays mounted while
// another tab is shown, so a save always sends all of them.

export interface EditorOptions {
  // Pages that can be the parent (pages only).
  parents: { id: string; title: string; path: string }[] | null;
  // Users the author can be changed to (posts, for someone allowed post.update).
  authors: { id: string; name: string }[] | null;
  // Terms to pick from (posts, for someone allowed term.assign).
  categories: { id: string; name: string }[] | null;
  tags: { id: string; name: string }[] | null;
}

export interface BackgroundChoice {
  // The page's own colour, or with `everywhere` the site's: "#rrggbb", or "" for none.
  color: string;
  // On: the colour is saved as every page's and post's (the theme's), not this one's alone.
  everywhere: boolean;
  // The site's colour as saved ("" for none).
  siteColor: string;
  // Whether the viewer may change the site's (theme.update).
  canSetSite: boolean;
  onColorChange: (color: string) => void;
  onEverywhereChange: (on: boolean) => void;
}

// The page's background, and whether it's every page's. The canvas shows it as it's picked.
function BackgroundSettings({
  type,
  choice,
  error,
}: {
  type: EntryKind;
  choice: BackgroundChoice;
  error: string | undefined;
}) {
  const id = useId();
  const { color, everywhere, siteColor } = choice;
  // What the trigger names when there's no colour of its own.
  const inherited = everywhere || !siteColor ? "The theme's" : "The site's";

  function setEverywhere(on: boolean) {
    // On, an empty choice starts from the site's colour, so turning it on clears nothing. Off,
    // the site's colour needs no copy of its own: the page shows it anyway.
    if (on && !color && siteColor) choice.onColorChange(siteColor);
    if (!on && color === siteColor) choice.onColorChange("");
    choice.onEverywhereChange(on);
  }

  return (
    <>
      <Field>
        <FieldLabel>Colour</FieldLabel>
        <div className="entry-settings__color">
          <ColorPicker value={color || siteColor || "#ffffff"} onValueChange={choice.onColorChange}>
            <FieldControl>
              <ColorPickerTrigger>{color ? undefined : inherited}</ColorPickerTrigger>
            </FieldControl>
            <ColorPickerContent>
              <ColorPickerArea />
              <ColorPickerHue />
              <ColorPickerInput />
              <ColorPickerSwatches aria-label="Backgrounds">
                {BACKGROUND_PRESETS.map((option) => (
                  <ColorPickerSwatch
                    key={option.value}
                    value={option.value}
                    aria-label={option.name}
                  />
                ))}
              </ColorPickerSwatches>
            </ColorPickerContent>
          </ColorPicker>
          {color ? (
            <Button intent="ghost" size="sm" onClick={() => choice.onColorChange("")}>
              {`Use ${inherited.toLowerCase()}`}
            </Button>
          ) : null}
        </div>
        <FieldDescription>
          {everywhere
            ? "The whole page behind the blocks, on every page and post. Text, lines and muted sections are set to read on it."
            : `The whole ${type} behind the blocks. Text, lines and muted sections are set to read on it.`}
        </FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>
      {choice.canSetSite ? (
        <Field>
          <div className="entry-settings__switch">
            <Switch
              id={`${id}-everywhere`}
              checked={everywhere}
              onCheckedChange={setEverywhere}
              aria-describedby={`${id}-everywhere-about`}
            />
            <label htmlFor={`${id}-everywhere`}>Use on every page and post</label>
          </div>
          <FieldDescription id={`${id}-everywhere-about`}>
            Saved as the site&apos;s background. A page or post with a colour of its own keeps it.
          </FieldDescription>
        </Field>
      ) : null}
    </>
  );
}

// A field with a limit, and how much of it is used.
function Counted({
  name,
  label,
  limit,
  defaultValue,
  multiline,
  error,
}: {
  name: keyof EditorValues;
  label: string;
  limit: number;
  defaultValue: string;
  multiline?: boolean;
  error?: string | undefined;
}) {
  const [length, setLength] = useState(defaultValue.length);
  const over = length > limit;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl>
        {multiline ? (
          <Textarea
            name={name}
            rows={3}
            autoResize
            defaultValue={defaultValue}
            onInput={(event) => setLength(event.currentTarget.value.length)}
          />
        ) : (
          <Input
            name={name}
            defaultValue={defaultValue}
            onInput={(event) => setLength(event.currentTarget.value.length)}
          />
        )}
      </FieldControl>
      <FieldDescription>
        {length} of {limit} characters
      </FieldDescription>
      <FieldError>{error ?? (over ? `Use at most ${limit} characters.` : undefined)}</FieldError>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="entry-settings__card">{children}</CardContent>
    </Card>
  );
}

export function EntrySettings({
  type,
  values,
  errors,
  entry,
  options,
  createTerms,
  publishing,
  featuredMediaId,
  onFeaturedChange,
  background,
}: {
  type: EntryKind;
  values: EditorValues;
  errors: Partial<Record<EditorField, string>>;
  entry: EditorEntry | null;
  options: EditorOptions;
  createTerms: boolean;
  // The publishing card's fields, which the editor owns (its date check runs on submit).
  publishing: ReactNode;
  featuredMediaId: string;
  onFeaturedChange: (id: string) => void;
  background: BackgroundChoice;
}) {
  return (
    <div className="entry-settings">
      <Section title="Publishing">{publishing}</Section>

      <Section title="Address">
        <Field>
          <FieldLabel>Slug</FieldLabel>
          <FieldControl>
            <Input name="slug" defaultValue={values.slug} spellCheck={false} />
          </FieldControl>
          <FieldDescription>
            {entry ? `Now at ${entry.path}. ` : null}
            Lowercase letters, digits and hyphens. Empty makes one from the title.
          </FieldDescription>
          <FieldError>{errors.slug}</FieldError>
        </Field>
        {options.parents ? (
          <Field>
            <FieldLabel>Parent page</FieldLabel>
            <FieldControl>
              <NativeSelect name="parentId" defaultValue={values.parentId}>
                <option value="">None (top level)</option>
                {options.parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.title} ({parent.path})
                  </option>
                ))}
              </NativeSelect>
            </FieldControl>
            <FieldError>{errors.parentId}</FieldError>
          </Field>
        ) : null}
      </Section>

      <Section title="Featured image">
        <MediaInput
          label="Image"
          value={featuredMediaId}
          accept="image"
          optional
          error={errors.featuredMediaId}
          onChange={(id) => onFeaturedChange(id ?? "")}
          description={`Shown with the ${type} in lists, and when it's shared.`}
        />
      </Section>

      <Section title="Background">
        <BackgroundSettings type={type} choice={background} error={errors.background} />
      </Section>

      {options.authors ? (
        <Section title="Author">
          <Field>
            <FieldLabel>Written by</FieldLabel>
            <FieldControl>
              <NativeSelect name="authorId" defaultValue={values.authorId}>
                {options.authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.name}
                  </option>
                ))}
              </NativeSelect>
            </FieldControl>
            <FieldError>{errors.authorId}</FieldError>
          </Field>
        </Section>
      ) : null}

      {options.categories && options.tags ? (
        <Section title="Categories and tags">
          <TermPicker
            taxonomy="category"
            name="categoryIds"
            label="Categories"
            options={options.categories}
            defaultPicked={values.categoryIds}
            canCreate={createTerms}
            error={errors.categoryIds}
          />
          <TermPicker
            taxonomy="tag"
            name="tagIds"
            label="Tags"
            options={options.tags}
            defaultPicked={values.tagIds}
            canCreate={createTerms}
            error={errors.tagIds}
          />
        </Section>
      ) : null}

      <Section title="Summary">
        <Counted
          name="excerpt"
          label="Excerpt"
          limit={ENTRY_LIMITS.excerpt}
          defaultValue={values.excerpt}
          multiline
          error={errors.excerpt}
        />
      </Section>

      <Section title="Search engines">
        <Counted
          name="seoTitle"
          label="Title for search results"
          limit={ENTRY_LIMITS.seoTitle}
          defaultValue={values.seoTitle}
          error={errors.seoTitle}
        />
        <Counted
          name="seoDescription"
          label="Description for search results"
          limit={ENTRY_LIMITS.seoDescription}
          defaultValue={values.seoDescription}
          multiline
          error={errors.seoDescription}
        />
      </Section>
    </div>
  );
}
