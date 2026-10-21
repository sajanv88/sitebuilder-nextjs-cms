"use client";

import {
  Badge,
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
  toast,
} from "@nuvui/react";
import type { TaxonomyKind } from "@sitebuilder/schema";
import { useState, useTransition } from "react";
import { createTermFromEditor } from "@/actions/entry-editor";
import "./term-picker.scss";

// Categories or tags for a post: a Combobox with several values, sent with the form as one
// hidden input per id. Someone allowed to create terms can add one from what they typed.

const CREATE = "__create__";

const NOUNS = {
  category: { one: "category", many: "categories" },
  tag: { one: "tag", many: "tags" },
} as const satisfies Record<TaxonomyKind, { one: string; many: string }>;

export function TermPicker({
  taxonomy,
  name,
  label,
  options: initialOptions,
  defaultPicked,
  canCreate,
  error,
}: {
  taxonomy: TaxonomyKind;
  name: string;
  label: string;
  options: { id: string; name: string }[];
  defaultPicked: string[];
  canCreate: boolean;
  error?: string | undefined;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [picked, setPicked] = useState(defaultPicked);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const noun = NOUNS[taxonomy];
  const typed = search.trim();
  const exists = options.some((option) => option.name.toLowerCase() === typed.toLowerCase());
  const names = new Map(options.map((option) => [option.id, option.name]));

  function create() {
    startTransition(async () => {
      const result = await createTermFromEditor({ taxonomy, name: typed });
      if (!result.ok) {
        toast(result.error, { intent: "danger" });
        return;
      }
      setOptions((current) => [...current, result.term]);
      setPicked((current) => [...current, result.term.id]);
      setSearch("");
    });
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Combobox
        multiple
        name={name}
        value={picked}
        onValueChange={(value) => setPicked(value.filter((id) => id !== CREATE))}
      >
        <FieldControl>
          <ComboboxTrigger className="term-picker__trigger" disabled={pending}>
            <ComboboxValue placeholder={`Choose ${noun.many}`}>
              {picked.length === 1 ? names.get(picked[0] ?? "") : `${picked.length} ${noun.many}`}
            </ComboboxValue>
          </ComboboxTrigger>
        </FieldControl>
        <ComboboxContent
          aria-label={label}
          label={`Search ${noun.many}`}
          searchPlaceholder="Search"
          search={search}
          onSearchChange={setSearch}
        >
          <ComboboxEmpty>No {noun.one} found.</ComboboxEmpty>
          {options.map((option) => (
            <ComboboxItem key={option.id} value={option.id} textValue={option.name}>
              {option.name}
            </ComboboxItem>
          ))}
          {canCreate && typed && !exists ? (
            // Keyed on the text: the list reads an option's text when it mounts, so this one is
            // mounted afresh for each change, and always matches what was typed.
            <ComboboxItem key={typed} value={CREATE} textValue={typed} onSelect={create}>
              Add {noun.one} “{typed}”
            </ComboboxItem>
          ) : null}
        </ComboboxContent>
      </Combobox>
      {picked.length > 0 ? (
        <ul className="term-picker__picked" aria-label={`Chosen ${noun.many}`}>
          {picked.map((id) => (
            <li key={id}>
              <Badge>{names.get(id) ?? "Removed"}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <FieldDescription>None chosen.</FieldDescription>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
