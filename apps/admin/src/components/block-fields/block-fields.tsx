// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from "@nuvui/icons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerHue,
  ColorPickerInput,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerTrigger,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxLoading,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Fieldset,
  FieldsetLegend,
  Input,
  NativeSelect,
  NumberField,
  Skeleton,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@nuvui/react";
import {
  type Field as BlockField,
  FEATURE_ICON_NAMES,
  FEATURE_ICONS,
  type RenderMedia,
} from "@sitebuilder/blocks";
import type { LinkTarget, MediaKind } from "@sitebuilder/schema";
import dynamic from "next/dynamic";
import { useEffect, useId, useState } from "react";
import { type LinkOption, searchLinkTargets } from "@/actions/entry-editor";
import { BACKGROUND_PRESETS } from "@/components/appearance-form/brand";
import { useEditorData } from "@/components/block-editor/editor-data";
import { MediaPicker } from "@/components/media-picker/media-picker";
import "./block-fields.scss";

// The inspector's controls, one for each kind of field a block describes (packages/blocks
// types.ts). Every one is a nuvui component in a Field or a Fieldset. A field gets its value and
// hands back the new one; undefined takes an optional prop away.

// nuvui's editor is about 120 kB: loaded only when a text block is being edited (design §8).
const RichTextEditor = dynamic(
  () => import("@nuvui/editor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="block-fields__loading" />,
  },
);

export interface FieldProps {
  field: BlockField;
  value: unknown;
  onChange: (value: unknown) => void;
  // Problems the last save found, by prop name.
  errors: Record<string, string>;
  // The block's other props, for a field that reads one (a table's rows read its columns).
  siblings: Record<string, unknown>;
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function swap<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  const next = [...list];
  const to = index + step;
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

// ── Plain fields ─────────────────────────────────────────────────────────────────────────────

function TextField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "text" }> }) {
  const text = asString(value);
  const set = (next: string) => onChange(field.optional && next === "" ? undefined : next);
  return (
    <Field required={!field.optional}>
      <FieldLabel>{field.label}</FieldLabel>
      <FieldControl>
        {field.multiline ? (
          <Textarea
            value={text}
            rows={3}
            autoResize
            maxLength={field.max}
            onChange={(e) => set(e.currentTarget.value)}
          />
        ) : (
          <Input value={text} maxLength={field.max} onChange={(e) => set(e.currentTarget.value)} />
        )}
      </FieldControl>
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      <FieldError>{errors[field.name]}</FieldError>
    </Field>
  );
}

function RichTextField({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  return (
    <div className="block-fields__rich">
      <span id={`${id}-label`} className="block-fields__label">
        {field.label}
      </span>
      <RichTextEditor
        aria-labelledby={`${id}-label`}
        {...(errors[field.name] ? { "aria-describedby": `${id}-error`, "aria-invalid": true } : {})}
        value={asString(value)}
        onValueChange={(html) => onChange(html)}
        placeholder="Write here. Select words to format them."
      />
      {errors[field.name] ? (
        <p id={`${id}-error`} className="block-fields__error">
          {errors[field.name]}
        </p>
      ) : null}
    </div>
  );
}

function ChoiceField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "choice" }> }) {
  return (
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <FieldControl>
        <NativeSelect
          value={value === undefined ? "" : String(value)}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(field.numeric ? Number(next) : next);
          }}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </FieldControl>
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      <FieldError>{errors[field.name]}</FieldError>
    </Field>
  );
}

// Horizontal alignment as three icon buttons, each named for a screen reader. Stored as start
// and end, so a right-to-left site mirrors. A field that inherits can have none pressed: the
// block then follows its section, and pressing the pressed one again lets it go.
const ALIGN_OPTIONS = [
  { value: "start", label: "Left", icon: AlignLeftIcon },
  { value: "center", label: "Center", icon: AlignCenterIcon },
  { value: "end", label: "Right", icon: AlignRightIcon },
] as const;

function AlignField({
  field,
  value,
  onChange,
}: FieldProps & { field: Extract<BlockField, { kind: "align" }> }) {
  const id = useId();
  return (
    <div className="block-fields__rich">
      <span id={`${id}-label`} className="block-fields__label">
        {field.label}
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        aria-labelledby={`${id}-label`}
        {...(field.description ? { "aria-describedby": `${id}-hint` } : {})}
        value={typeof value === "string" ? value : ""}
        onValueChange={(next) => {
          if (next) onChange(next);
          else if (field.inherit) onChange(undefined);
        }}
        className="block-fields__align"
      >
        {ALIGN_OPTIONS.map(({ value: option, label, icon: Icon }) => (
          <ToggleGroupItem key={option} value={option} aria-label={label}>
            <Icon aria-hidden="true" size={16} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {field.description ? (
        <p id={`${id}-hint`} className="block-fields__hint">
          {field.description}
        </p>
      ) : null}
    </div>
  );
}

// A background (packages/blocks surface.tsx): none, the theme's muted shade or brand colour, or
// a colour of the owner's own, picked beside the choices. None takes the prop away.
const BACKGROUND_OPTIONS = [
  { value: "none", label: "None" },
  { value: "muted", label: "Muted" },
  { value: "primary", label: "Brand" },
  { value: "custom", label: "Colour" },
] as const;

function BackgroundField({
  field,
  value,
  onChange,
}: FieldProps & { field: Extract<BlockField, { kind: "background" }> }) {
  const id = useId();
  const custom = typeof value === "string" && value.startsWith("#") ? value : null;
  const choice = custom ? "custom" : value === "muted" || value === "primary" ? value : "none";
  // The last colour picked, so Colour after Muted brings it back.
  const [lastCustom, setLastCustom] = useState(custom ?? "#f3ead8");
  const pick = (color: string) => {
    setLastCustom(color);
    onChange(color);
  };
  return (
    <div className="block-fields__rich">
      <span id={`${id}-label`} className="block-fields__label">
        {field.label}
      </span>
      <div className="block-fields__background">
        <ToggleGroup
          type="single"
          size="sm"
          aria-labelledby={`${id}-label`}
          {...(field.description ? { "aria-describedby": `${id}-hint` } : {})}
          value={choice}
          onValueChange={(next) => {
            if (next === "custom") onChange(lastCustom);
            else if (next === "muted" || next === "primary") onChange(next);
            else if (next === "none") onChange(undefined);
          }}
        >
          {BACKGROUND_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.value === "none" ? (field.noneLabel ?? option.label) : option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {custom ? (
          <ColorPicker value={custom} onValueChange={pick}>
            <ColorPickerTrigger aria-label={`${field.label} colour`} />
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
        ) : null}
      </div>
      {field.description ? (
        <p id={`${id}-hint`} className="block-fields__hint">
          {field.description}
        </p>
      ) : null}
    </div>
  );
}

function ToggleField({ field, value, onChange }: FieldProps) {
  return (
    <Field orientation="horizontal">
      <FieldControl>
        <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
      </FieldControl>
      <FieldLabel>{field.label}</FieldLabel>
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function NumberInputField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "number" }> }) {
  return (
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <FieldControl>
        <NumberField
          value={typeof value === "number" ? value : field.min}
          min={field.min}
          max={field.max}
          onValueChange={(next) => onChange(next ?? field.min)}
        />
      </FieldControl>
      <FieldError>{errors[field.name]}</FieldError>
    </Field>
  );
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────

function EntryPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { links, addLink } = useEditorData();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchLinkTargets(search).then((found) => {
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

  const chosen = links[value];
  return (
    <Combobox
      value={value}
      onValueChange={(id) => {
        const picked = results.find((option) => option.id === id);
        if (picked) addLink(picked);
        onChange(id);
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
                <span className="block-fields__option">
                  <span>{option.title}</span>
                  <span className="block-fields__hint">
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

// A LinkTarget: a page or post (followed through renames), or a web address.
function LinkInput({
  label,
  value,
  optional,
  error,
  onChange,
}: {
  label: string;
  value: unknown;
  optional: boolean;
  error: string | undefined;
  onChange: (value: LinkTarget | undefined) => void;
}) {
  const target = asRecord(value);
  const kind = target.kind === "entry" ? "entry" : target.kind === "url" ? "url" : "none";
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{label}</FieldsetLegend>
      <Field>
        <FieldLabel>Kind of link</FieldLabel>
        <FieldControl>
          <NativeSelect
            value={kind}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (next === "none") onChange(undefined);
              else if (next === "url") onChange({ kind: "url", url: "/" });
              else onChange({ kind: "entry", entryId: "" } as unknown as LinkTarget);
            }}
          >
            {optional ? <option value="none">No link</option> : null}
            <option value="entry">A page or post on this site</option>
            <option value="url">A web address</option>
          </NativeSelect>
        </FieldControl>
      </Field>
      {kind === "entry" ? (
        <Field>
          <FieldLabel>Page or post</FieldLabel>
          <EntryPicker
            value={asString(target.entryId)}
            onChange={(entryId) => onChange({ kind: "entry", entryId })}
          />
          <FieldDescription>Follows the page if its address changes.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      ) : kind === "url" ? (
        <Field>
          <FieldLabel>Address</FieldLabel>
          <FieldControl>
            <Input
              value={asString(target.url)}
              onChange={(event) => onChange({ kind: "url", url: event.currentTarget.value })}
              placeholder="https://example.com or /contact"
              spellCheck={false}
            />
          </FieldControl>
          <FieldDescription>A web address, a path on this site, mailto: or tel:.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      ) : null}
    </Fieldset>
  );
}

function LinkField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "link" }> }) {
  return (
    <LinkInput
      label={field.label}
      value={value}
      optional={field.optional === true}
      error={errors[field.name]}
      onChange={onChange}
    />
  );
}

function ActionField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "action" }> }) {
  const action = value === undefined ? undefined : asRecord(value);
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      {field.optional ? (
        <Field orientation="horizontal">
          <FieldControl>
            <Switch
              checked={action !== undefined}
              onCheckedChange={(on) =>
                onChange(on ? { label: "Learn more", href: { kind: "url", url: "/" } } : undefined)
              }
            />
          </FieldControl>
          <FieldLabel>Show this button</FieldLabel>
        </Field>
      ) : null}
      {action ? (
        <>
          <Field required>
            <FieldLabel>Words on the button</FieldLabel>
            <FieldControl>
              <Input
                value={asString(action.label)}
                maxLength={field.max}
                onChange={(event) => onChange({ ...action, label: event.currentTarget.value })}
              />
            </FieldControl>
            <FieldError>{errors[field.name]}</FieldError>
          </Field>
          <LinkInput
            label="Goes to"
            value={action.href}
            optional={false}
            error={undefined}
            onChange={(href) => onChange({ ...action, href })}
          />
        </>
      ) : null}
    </Fieldset>
  );
}

// ── Media ────────────────────────────────────────────────────────────────────────────────────

function MediaPreview({ media }: { media: RenderMedia | undefined }) {
  if (!media) return <span className="block-fields__thumb block-fields__thumb--empty" />;
  if (media.mimeType.startsWith("image/")) {
    // biome-ignore lint/performance/noImgElement: files are served by the site zone at /media/ (decisions #58).
    return <img className="block-fields__thumb" src={media.url} alt="" />;
  }
  const Icon = media.mimeType.startsWith("video/") ? VideoIcon : FileTextIcon;
  return (
    <span className="block-fields__thumb block-fields__thumb--icon">
      <Icon aria-hidden="true" size={20} />
    </span>
  );
}

export function MediaInput({
  label,
  value,
  accept,
  optional,
  error,
  onChange,
  description,
}: {
  label: string;
  value: string;
  accept: MediaKind | "any";
  optional: boolean;
  error: string | undefined;
  onChange: (id: string | undefined) => void;
  description?: string;
}) {
  const { media, addMedia, upload } = useEditorData();
  const [open, setOpen] = useState(false);
  const chosen = value ? media[value] : undefined;
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{label}</FieldsetLegend>
      <div className="block-fields__media">
        <MediaPreview media={chosen} />
        <span className="block-fields__media-name">
          {chosen ? chosen.filename : value ? "A file that was deleted" : "None chosen"}
        </span>
      </div>
      <div className="block-fields__buttons">
        <Button size="sm" intent="secondary" onClick={() => setOpen(true)}>
          {value ? "Replace" : "Choose"}
        </Button>
        {value && optional ? (
          <Button size="sm" intent="ghost" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        ) : null}
      </div>
      {description ? <p className="block-fields__hint">{description}</p> : null}
      {error ? (
        <p className="block-fields__error" role="alert">
          {error}
        </p>
      ) : null}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        accept={accept}
        upload={upload}
        onPick={(picked) => {
          addMedia(picked);
          if (picked[0]) onChange(picked[0].id);
        }}
      />
    </Fieldset>
  );
}

function MediaField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "media" }> }) {
  return (
    <MediaInput
      label={field.label}
      value={asString(value)}
      accept={field.accept}
      optional={field.optional === true}
      error={errors[field.name]}
      onChange={(id) => onChange(field.optional ? id : (id ?? ""))}
    />
  );
}

function MediaListField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "media-list" }> }) {
  const { media, addMedia, upload } = useEditorData();
  const [open, setOpen] = useState(false);
  const ids = asStrings(value);
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      {ids.length > 0 ? (
        <ol className="block-fields__list">
          {ids.map((id, index) => (
            <li key={id} className="block-fields__row">
              <MediaPreview media={media[id]} />
              <span className="block-fields__media-name">
                {media[id]?.filename ?? "A deleted file"}
              </span>
              <span className="block-fields__row-actions">
                <Button
                  size="sm"
                  intent="ghost"
                  aria-label="Move earlier"
                  disabled={index === 0}
                  onClick={() => onChange(swap(ids, index, -1))}
                >
                  <ArrowUpIcon size={16} />
                </Button>
                <Button
                  size="sm"
                  intent="ghost"
                  aria-label="Move later"
                  disabled={index === ids.length - 1}
                  onClick={() => onChange(swap(ids, index, 1))}
                >
                  <ArrowDownIcon size={16} />
                </Button>
                <Button
                  size="sm"
                  intent="ghost"
                  aria-label={`Take out ${media[id]?.filename ?? "this file"}`}
                  onClick={() => onChange(ids.filter((other) => other !== id))}
                >
                  <TrashIcon size={16} />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="block-fields__hint">None chosen yet.</p>
      )}
      <div className="block-fields__buttons">
        <Button
          size="sm"
          intent="secondary"
          disabled={ids.length >= field.max}
          onClick={() => setOpen(true)}
        >
          <PlusIcon size={16} />
          Add
        </Button>
      </div>
      {errors[field.name] ? (
        <p className="block-fields__error" role="alert">
          {errors[field.name]}
        </p>
      ) : null}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        accept={field.accept}
        multiple
        upload={upload}
        onPick={(picked) => {
          addMedia(picked);
          const next = [...ids, ...picked.map((item) => item.id).filter((id) => !ids.includes(id))];
          onChange(next.slice(0, field.max));
        }}
      />
    </Fieldset>
  );
}

// An image's alt text: the file's own, its own words here, or none (decorative, design §5.5).
function AltField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "alt" }> }) {
  const mode = value === undefined ? "file" : value === "" ? "decorative" : "own";
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      <Field>
        <FieldLabel>Use</FieldLabel>
        <FieldControl>
          <NativeSelect
            value={mode}
            onChange={(event) => {
              const next = event.currentTarget.value;
              onChange(
                next === "file" ? undefined : next === "decorative" ? "" : "Describe the picture",
              );
            }}
          >
            <option value="file">The file's alt text, from the media library</option>
            <option value="own">Words written here</option>
            <option value="decorative">None: the picture is only decoration</option>
          </NativeSelect>
        </FieldControl>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      </Field>
      {mode === "own" ? (
        <Field>
          <FieldLabel>Alt text</FieldLabel>
          <FieldControl>
            <Input
              value={asString(value)}
              maxLength={field.max}
              onChange={(event) => onChange(event.currentTarget.value)}
            />
          </FieldControl>
          <FieldError>{errors[field.name]}</FieldError>
        </Field>
      ) : null}
    </Fieldset>
  );
}

function IconField({ field, value, onChange }: FieldProps) {
  const name = asString(value);
  const Chosen = FEATURE_ICONS[name as keyof typeof FEATURE_ICONS];
  return (
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <Combobox value={name} onValueChange={(next) => onChange(next)}>
        <FieldControl>
          <ComboboxTrigger>
            <ComboboxValue placeholder="Choose an icon">
              {Chosen ? (
                <span className="block-fields__option-row">
                  <Chosen aria-hidden="true" size={16} />
                  {name}
                </span>
              ) : undefined}
            </ComboboxValue>
          </ComboboxTrigger>
        </FieldControl>
        <ComboboxContent aria-label="Icons" label="Search icons" searchPlaceholder="Search">
          <ComboboxEmpty>No icon found.</ComboboxEmpty>
          {FEATURE_ICON_NAMES.map((icon) => {
            const Icon = FEATURE_ICONS[icon];
            return (
              <ComboboxItem key={icon} value={icon} textValue={icon}>
                <span className="block-fields__option-row">
                  <Icon aria-hidden="true" size={16} />
                  {icon}
                </span>
              </ComboboxItem>
            );
          })}
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

// ── Lists ────────────────────────────────────────────────────────────────────────────────────

function StringsField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "strings" }> }) {
  const items = asStrings(value);
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: plain strings that may repeat; edited in place.
        <div key={index} className="block-fields__row">
          <Field className="block-fields__grow">
            <FieldLabel>{`${field.itemLabel} ${index + 1}`}</FieldLabel>
            <FieldControl>
              <Input
                value={item}
                maxLength={field.maxLength}
                onChange={(event) =>
                  onChange(items.map((old, i) => (i === index ? event.currentTarget.value : old)))
                }
              />
            </FieldControl>
          </Field>
          <Button
            size="sm"
            intent="ghost"
            aria-label={`Remove ${field.itemLabel.toLowerCase()} ${index + 1}`}
            disabled={items.length <= field.min}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <TrashIcon size={16} />
          </Button>
        </div>
      ))}
      <div className="block-fields__buttons">
        <Button
          size="sm"
          intent="secondary"
          disabled={items.length >= field.max}
          onClick={() => onChange([...items, ""])}
        >
          <PlusIcon size={16} />
          Add {field.itemLabel.toLowerCase()}
        </Button>
      </div>
      {errors[field.name] ? (
        <p className="block-fields__error" role="alert">
          {errors[field.name]}
        </p>
      ) : null}
    </Fieldset>
  );
}

function TermsField({ field, value, onChange }: FieldProps) {
  const { terms } = useEditorData();
  const picked = asStrings(value);
  const names = terms.filter((term) => picked.includes(term.id)).map((term) => term.name);
  return (
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <Combobox
        multiple
        value={picked}
        onValueChange={(next) => onChange(next.length > 0 ? next : undefined)}
      >
        <FieldControl>
          <ComboboxTrigger>
            <ComboboxValue placeholder="Every post">
              {names.length > 0 ? names.join(", ") : undefined}
            </ComboboxValue>
          </ComboboxTrigger>
        </FieldControl>
        <ComboboxContent
          aria-label={field.label}
          label="Search categories and tags"
          searchPlaceholder="Search"
        >
          <ComboboxEmpty>No category or tag found.</ComboboxEmpty>
          {terms.map((term) => (
            <ComboboxItem key={term.id} value={term.id} textValue={term.name}>
              {term.name} ({term.taxonomy})
            </ComboboxItem>
          ))}
        </ComboboxContent>
      </Combobox>
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function ListField({
  field,
  value,
  onChange,
  errors,
}: FieldProps & { field: Extract<BlockField, { kind: "list" }> }) {
  const items = Array.isArray(value) ? value.map(asRecord) : [];
  const [open, setOpen] = useState<string[]>([]);
  const set = (index: number, item: Record<string, unknown>) =>
    onChange(items.map((old, i) => (i === index ? item : old)));
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      <Accordion
        type="multiple"
        value={open}
        onValueChange={setOpen}
        className="block-fields__accordion"
      >
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids; their place is their identity.
          <AccordionItem key={index} value={String(index)}>
            <AccordionTrigger headingLevel={4}>
              {field.title(item) || `${field.itemLabel} ${index + 1}`}
            </AccordionTrigger>
            <AccordionContent>
              <div className="block-fields__item">
                {field.fields.map((inner) => (
                  <BlockFieldControl
                    key={inner.name}
                    field={inner}
                    value={item[inner.name]}
                    errors={{}}
                    siblings={item}
                    onChange={(next) => {
                      const copy = { ...item };
                      if (next === undefined) delete copy[inner.name];
                      else copy[inner.name] = next;
                      set(index, copy);
                    }}
                  />
                ))}
                <div className="block-fields__buttons">
                  <Button
                    size="sm"
                    intent="ghost"
                    disabled={index === 0}
                    onClick={() => onChange(swap(items, index, -1))}
                  >
                    <ArrowUpIcon size={16} />
                    Earlier
                  </Button>
                  <Button
                    size="sm"
                    intent="ghost"
                    disabled={index === items.length - 1}
                    onClick={() => onChange(swap(items, index, 1))}
                  >
                    <ArrowDownIcon size={16} />
                    Later
                  </Button>
                  <Button
                    size="sm"
                    intent="ghost"
                    disabled={items.length <= field.min}
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                  >
                    <TrashIcon size={16} />
                    Remove
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="block-fields__buttons">
        <Button
          size="sm"
          intent="secondary"
          disabled={items.length >= field.max}
          onClick={() => {
            onChange([...items, field.newItem()]);
            setOpen((now) => [...now, String(items.length)]);
          }}
        >
          <PlusIcon size={16} />
          Add {field.itemLabel.toLowerCase()}
        </Button>
      </div>
      {errors[field.name] ? (
        <p className="block-fields__error" role="alert">
          {errors[field.name]}
        </p>
      ) : null}
    </Fieldset>
  );
}

// A table's rows: a cell for each of the block's columns.
function RowsField({
  field,
  value,
  onChange,
  errors,
  siblings,
}: FieldProps & { field: Extract<BlockField, { kind: "rows" }> }) {
  const columns = asStrings(siblings[field.columnsFrom]);
  const rows = (Array.isArray(value) ? value : []).map((row) => {
    const cells = asStrings(row);
    return columns.map((_, i) => cells[i] ?? "");
  });
  return (
    <Fieldset className="block-fields__group">
      <FieldsetLegend>{field.label}</FieldsetLegend>
      {rows.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids; edited in place.
        <Fieldset key={rowIndex} className="block-fields__table-row">
          <FieldsetLegend>{`Row ${rowIndex + 1}`}</FieldsetLegend>
          {row.map((cell, cellIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per column, by position.
            <Field key={cellIndex}>
              <FieldLabel>{columns[cellIndex] || `Column ${cellIndex + 1}`}</FieldLabel>
              <FieldControl>
                <Input
                  value={cell}
                  maxLength={field.maxLength}
                  onChange={(event) =>
                    onChange(
                      rows.map((r, i) =>
                        i === rowIndex
                          ? r.map((c, j) => (j === cellIndex ? event.currentTarget.value : c))
                          : r,
                      ),
                    )
                  }
                />
              </FieldControl>
            </Field>
          ))}
          <div className="block-fields__buttons">
            <Button
              size="sm"
              intent="ghost"
              onClick={() => onChange(rows.filter((_, i) => i !== rowIndex))}
            >
              <TrashIcon size={16} />
              Remove row {rowIndex + 1}
            </Button>
          </div>
        </Fieldset>
      ))}
      <div className="block-fields__buttons">
        <Button
          size="sm"
          intent="secondary"
          disabled={rows.length >= field.max}
          onClick={() => onChange([...rows, columns.map(() => "")])}
        >
          <PlusIcon size={16} />
          Add a row
        </Button>
      </div>
      {errors[field.name] ? (
        <p className="block-fields__error" role="alert">
          {errors[field.name]}
        </p>
      ) : null}
    </Fieldset>
  );
}

// ── The switch ───────────────────────────────────────────────────────────────────────────────

export function BlockFieldControl(props: FieldProps) {
  const { field } = props;
  switch (field.kind) {
    case "text":
      return <TextField {...props} field={field} />;
    case "richtext":
      return <RichTextField {...props} />;
    case "choice":
      return <ChoiceField {...props} field={field} />;
    case "toggle":
      return <ToggleField {...props} />;
    case "number":
      return <NumberInputField {...props} field={field} />;
    case "link":
      return <LinkField {...props} field={field} />;
    case "action":
      return <ActionField {...props} field={field} />;
    case "media":
      return <MediaField {...props} field={field} />;
    case "media-list":
      return <MediaListField {...props} field={field} />;
    case "alt":
      return <AltField {...props} field={field} />;
    case "icon":
      return <IconField {...props} />;
    case "strings":
      return <StringsField {...props} field={field} />;
    case "terms":
      return <TermsField {...props} />;
    case "list":
      return <ListField {...props} field={field} />;
    case "rows":
      return <RowsField {...props} field={field} />;
    case "align":
      return <AlignField {...props} field={field} />;
    case "background":
      return <BackgroundField {...props} field={field} />;
  }
}
