"use client";

import {
  Button,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLoading,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
} from "@nuvui/react";
import { newBlockId } from "@sitebuilder/blocks";
import { Url } from "@sitebuilder/schema";
import { type ReactNode, useEffect, useState } from "react";
import * as v from "valibot";
import { type MenuTarget, searchMenuTargets } from "@/actions/menus";
import type { AnyItem } from "@/components/menu-editor/menu-model";
import "./menu-item-form.scss";

// One menu item, in the Menus screen's dialog (design §5.3): a label, and where it goes: a page
// or post (followed through renames), a category or tag's archive, a web address, or, at the
// top level, a group that only holds the items under it.

export interface MenuTerm {
  id: string;
  name: string;
  taxonomy: "category" | "tag";
}

type Kind = AnyItem["kind"];

function EntrySearch({
  value,
  chosen,
  onChange,
}: {
  value: string;
  chosen: MenuTarget | undefined;
  onChange: (target: MenuTarget) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MenuTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMenuTargets(search).then((found) => {
        if (!current) return;
        setResults(found);
        setLoading(false);
      });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <Combobox
      value={value}
      onValueChange={(id) => {
        const picked = results.find((option) => option.id === id);
        if (picked) onChange(picked);
      }}
    >
      <FieldControl>
        <ComboboxTrigger>
          <ComboboxValue placeholder="Choose a page or post">
            {chosen ? `${chosen.title} (${chosen.path})` : value ? "A page that's gone" : undefined}
          </ComboboxValue>
        </ComboboxTrigger>
      </FieldControl>
      <ComboboxContent
        aria-label="Pages and posts"
        label="Search pages and posts"
        searchPlaceholder="Title"
        search={search}
        onSearchChange={setSearch}
        shouldFilter={false}
      >
        {loading ? <ComboboxLoading label="Loading pages and posts" /> : null}
        <ComboboxEmpty>No page or post found.</ComboboxEmpty>
        {loading
          ? null
          : results.map((option) => (
              <ComboboxItem key={option.id} value={option.id} textValue={option.title}>
                <span className="menu-item-form__option">
                  <span>{option.title}</span>
                  <span className="menu-item-form__hint">
                    {option.path}
                    {option.public ? "" : ", not published"}
                  </span>
                </span>
              </ComboboxItem>
            ))}
      </ComboboxContent>
    </Combobox>
  );
}

export function MenuItemForm({
  item,
  topLevel,
  entries,
  terms,
  onDone,
  onCancel,
  extra,
}: {
  // The item being changed; undefined adds one.
  item: AnyItem | undefined;
  // Groups exist only at the top level.
  topLevel: boolean;
  entries: Record<string, MenuTarget>;
  terms: MenuTerm[];
  onDone: (item: AnyItem, picked: MenuTarget | undefined) => void;
  onCancel: () => void;
  // More actions beside Cancel, such as Remove for an item that exists.
  extra?: ReactNode;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [kind, setKind] = useState<Kind>(item?.kind ?? "entry");
  const [entryId, setEntryId] = useState(item?.kind === "entry" ? item.entryId : "");
  const [picked, setPicked] = useState<MenuTarget | undefined>();
  const [termId, setTermId] = useState(item?.kind === "term" ? item.termId : "");
  const [url, setUrl] = useState(item?.kind === "url" ? item.url : "");
  const [newTab, setNewTab] = useState(item?.openInNewTab ?? false);
  const [errors, setErrors] = useState<Partial<Record<"label" | "target", string>>>({});

  const chosenEntry = picked?.id === entryId ? picked : entries[entryId];

  function done() {
    const next: Partial<Record<"label" | "target", string>> = {};
    const name = label.trim();
    if (name.length < 1 || name.length > 80) next.label = "Enter a label of up to 80 characters.";
    if (kind === "entry" && !entryId) next.target = "Choose a page or post.";
    if (kind === "term" && !termId) next.target = "Choose a category or tag.";
    if (kind === "url" && !v.is(Url, url.trim())) {
      next.target = "Enter a site path such as /about, or an address starting with https://.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const id = item?.id ?? newBlockId();
    const base = { id, label: name, ...(kind !== "group" && newTab ? { openInNewTab: true } : {}) };
    const built: AnyItem =
      kind === "entry"
        ? { ...base, kind, entryId }
        : kind === "term"
          ? { ...base, kind, termId }
          : kind === "url"
            ? { ...base, kind, url: url.trim() }
            : { ...base, kind: "group", children: [] };
    onDone(built, picked);
  }

  const categories = terms.filter((term) => term.taxonomy === "category");
  const tags = terms.filter((term) => term.taxonomy === "tag");
  const chosenTerm = terms.find((term) => term.id === termId);

  return (
    <div className="menu-item-form">
      <Field required>
        <FieldLabel>Label</FieldLabel>
        <FieldControl>
          <Input value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        </FieldControl>
        <FieldDescription>The words in the menu.</FieldDescription>
        <FieldError>{errors.label}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Goes to</FieldLabel>
        <FieldControl>
          <NativeSelect
            value={kind}
            onChange={(event) => setKind(event.currentTarget.value as Kind)}
          >
            <option value="entry">A page or post on this site</option>
            <option value="term">A category or tag</option>
            <option value="url">A web address</option>
            {topLevel ? (
              <option value="group">Nothing: a group of the items under it</option>
            ) : null}
          </NativeSelect>
        </FieldControl>
      </Field>

      {kind === "entry" ? (
        <Field required>
          <FieldLabel>Page or post</FieldLabel>
          <EntrySearch
            value={entryId}
            chosen={chosenEntry}
            onChange={(target) => {
              setEntryId(target.id);
              setPicked(target);
              if (!label.trim()) setLabel(target.title.slice(0, 80));
            }}
          />
          <FieldDescription>Follows the page if its address changes.</FieldDescription>
          <FieldError>{errors.target}</FieldError>
        </Field>
      ) : kind === "term" ? (
        <Field required>
          <FieldLabel>Category or tag</FieldLabel>
          <Combobox
            value={termId}
            onValueChange={(id) => {
              setTermId(id);
              const term = terms.find((t) => t.id === id);
              if (term && !label.trim()) setLabel(term.name.slice(0, 80));
            }}
          >
            <FieldControl>
              <ComboboxTrigger>
                <ComboboxValue placeholder="Choose a category or tag">
                  {chosenTerm?.name ?? (termId ? "A term that's gone" : undefined)}
                </ComboboxValue>
              </ComboboxTrigger>
            </FieldControl>
            <ComboboxContent label="Search categories and tags" searchPlaceholder="Name">
              <ComboboxEmpty>No category or tag found.</ComboboxEmpty>
              {categories.length > 0 ? (
                <ComboboxGroup heading="Categories">
                  {categories.map((term) => (
                    <ComboboxItem key={term.id} value={term.id}>
                      {term.name}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ) : null}
              {tags.length > 0 ? (
                <ComboboxGroup heading="Tags">
                  {tags.map((term) => (
                    <ComboboxItem key={term.id} value={term.id}>
                      {term.name}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ) : null}
            </ComboboxContent>
          </Combobox>
          <FieldDescription>Its archive: every post in it.</FieldDescription>
          <FieldError>{errors.target}</FieldError>
        </Field>
      ) : kind === "url" ? (
        <Field required>
          <FieldLabel>Address</FieldLabel>
          <FieldControl>
            <Input
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              placeholder="https://example.com or /contact"
              spellCheck={false}
            />
          </FieldControl>
          <FieldError>{errors.target}</FieldError>
        </Field>
      ) : (
        <p className="menu-item-form__note">
          A group opens a list of the items under it. Add at least one before saving.
        </p>
      )}

      {kind !== "group" ? (
        <Field orientation="horizontal">
          <FieldControl>
            <Checkbox checked={newTab} onCheckedChange={(checked) => setNewTab(checked === true)} />
          </FieldControl>
          <FieldLabel>Open in a new tab</FieldLabel>
        </Field>
      ) : null}

      <div className="menu-item-form__actions">
        <Button onClick={done}>{item ? "Apply changes" : "Add item"}</Button>
        <Button intent="secondary" onClick={onCancel}>
          {item ? "Undo changes" : "Cancel"}
        </Button>
        {extra}
      </div>
    </div>
  );
}
