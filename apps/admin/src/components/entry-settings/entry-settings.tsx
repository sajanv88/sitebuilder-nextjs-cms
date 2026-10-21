"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
} from "@nuvui/react";
import { ENTRY_LIMITS, type EntryKind } from "@sitebuilder/schema";
import { type ReactNode, useState } from "react";
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
