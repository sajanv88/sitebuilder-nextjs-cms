// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { PlusIcon, TrashIcon } from "@nuvui/icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  NativeSelect,
  ToggleGroup,
  ToggleGroupItem,
} from "@nuvui/react";
import { FONT_WEIGHTS, type FontFamily, FontFamilyName } from "@sitebuilder/schema";
import { useEffect, useId, useState } from "react";
import * as v from "valibot";
import { MediaPicker } from "@/components/media-picker/media-picker";
import "./font-manager.scss";

// Appearance → Fonts (decisions #148): font families from WOFF2 files in the media library, and
// what each is for. A family's sample is drawn in it, loaded with the browser's FontFace API from
// the site's own /media addresses. Saved with the rest of Appearance.

export interface FontFile {
  filename: string;
  url: string;
}

const WEIGHT_NAMES: Record<(typeof FONT_WEIGHTS)[number], string> = {
  "100": "Thin (100)",
  "200": "Extra light (200)",
  "300": "Light (300)",
  "400": "Regular (400)",
  "500": "Medium (500)",
  "600": "Semibold (600)",
  "700": "Bold (700)",
  "800": "Extra bold (800)",
  "900": "Black (900)",
  "100 900": "Every weight: a variable font",
};

const USES = [
  { value: "none", label: "Not used" },
  { value: "text", label: "Text" },
  { value: "code", label: "Code" },
] as const;

// A weight and style read from a file's name, as font files are usually named.
function guess(filename: string): FontFamily["files"][number]["weight"] {
  const name = filename.toLowerCase();
  if (/variable|\bvf\b|\[wght/.test(name)) return "100 900";
  const words: [RegExp, FontFamily["files"][number]["weight"]][] = [
    [/thin|hairline/, "100"],
    [/extra-?light|ultra-?light/, "200"],
    [/light/, "300"],
    [/medium/, "500"],
    [/semi-?bold|demi-?bold/, "600"],
    [/extra-?bold|ultra-?bold/, "800"],
    [/black|heavy/, "900"],
    [/bold/, "700"],
  ];
  return words.find(([pattern]) => pattern.test(name))?.[1] ?? "400";
}

// Each family's files, loaded in the browser so its sample shows in it.
function useLoaded(fonts: readonly FontFamily[], files: Readonly<Record<string, FontFile>>) {
  useEffect(() => {
    const added: FontFace[] = [];
    for (const font of fonts) {
      for (const file of font.files) {
        const url = files[file.mediaId]?.url;
        if (!url) continue;
        const face = new FontFace(font.family, `url("${url}") format("woff2")`, {
          weight: file.weight,
          style: file.style,
          display: "swap",
        });
        document.fonts.add(face);
        added.push(face);
        face.load().catch(() => undefined);
      }
    }
    return () => {
      for (const face of added) document.fonts.delete(face);
    };
  }, [fonts, files]);
}

type Draft = { index: number | null; font: FontFamily };

function FamilyDialog({
  draft,
  files,
  upload,
  others,
  onFiles,
  onSave,
  onClose,
}: {
  draft: Draft;
  files: Readonly<Record<string, FontFile>>;
  upload: { allowed: boolean; maxBytes: number };
  // The other families' names, which this one can't take.
  others: readonly string[];
  onFiles: (added: Record<string, FontFile>) => void;
  onSave: (font: FontFamily) => void;
  onClose: () => void;
}) {
  const [font, setFont] = useState(draft.font);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    const name = v.safeParse(FontFamilyName, font.family);
    if (!name.success) {
      setProblem(name.issues[0].message);
      return;
    }
    if (others.some((other) => other.toLowerCase() === name.output.toLowerCase())) {
      setProblem("Another family has that name.");
      return;
    }
    if (font.files.length === 0) {
      setProblem("Add at least one WOFF2 file.");
      return;
    }
    onSave({ ...font, family: name.output });
  }

  return (
    <>
      <div className="font-manager__dialog">
        <Field required>
          <FieldLabel>Family name</FieldLabel>
          <FieldControl>
            <Input
              value={font.family}
              maxLength={60}
              placeholder="Inter"
              onChange={(event) => setFont({ ...font, family: event.currentTarget.value })}
            />
          </FieldControl>
          <FieldDescription>The font's own name, as its maker gives it.</FieldDescription>
          <FieldError>{problem}</FieldError>
        </Field>
        <div className="font-manager__files">
          <span className="font-manager__label">Files</span>
          {font.files.length === 0 ? (
            <p className="font-manager__hint">
              One WOFF2 file for each weight and style you use, or one variable font.
            </p>
          ) : null}
          {font.files.map((file, index) => (
            <div key={file.mediaId} className="font-manager__file">
              <span className="font-manager__filename">
                {files[file.mediaId]?.filename ?? "A deleted file"}
              </span>
              <NativeSelect
                aria-label="Weight"
                value={file.weight}
                onChange={(event) => {
                  const weight = event.currentTarget.value as typeof file.weight;
                  setFont({
                    ...font,
                    files: font.files.map((f, i) => (i === index ? { ...f, weight } : f)),
                  });
                }}
              >
                {FONT_WEIGHTS.map((weight) => (
                  <option key={weight} value={weight}>
                    {WEIGHT_NAMES[weight]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Style"
                value={file.style}
                onChange={(event) => {
                  const style = event.currentTarget.value as typeof file.style;
                  setFont({
                    ...font,
                    files: font.files.map((f, i) => (i === index ? { ...f, style } : f)),
                  });
                }}
              >
                <option value="normal">Upright</option>
                <option value="italic">Italic</option>
              </NativeSelect>
              <Button
                intent="ghost"
                size="sm"
                aria-label={`Remove ${files[file.mediaId]?.filename ?? "this file"}`}
                onClick={() =>
                  setFont({ ...font, files: font.files.filter((_, i) => i !== index) })
                }
              >
                <TrashIcon aria-hidden="true" size={16} />
              </Button>
            </div>
          ))}
          <Button
            intent="secondary"
            size="sm"
            className="font-manager__add"
            onClick={() => setPicking(true)}
          >
            <PlusIcon aria-hidden="true" size={16} />
            Add files
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button intent="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>
          {draft.index === null ? "Add the family" : "Keep the changes"}
        </Button>
      </DialogFooter>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        accept="font"
        multiple
        upload={upload}
        onPick={(picked) => {
          onFiles(
            Object.fromEntries(picked.map((m) => [m.id, { filename: m.filename, url: m.url }])),
          );
          const have = new Set(font.files.map((f) => f.mediaId));
          setFont({
            ...font,
            files: [
              ...font.files,
              ...picked
                .filter((m) => !have.has(m.id))
                .map((m) => ({
                  mediaId: m.id,
                  weight: guess(m.filename),
                  style: /italic|oblique/i.test(m.filename)
                    ? ("italic" as const)
                    : ("normal" as const),
                })),
            ].slice(0, 12),
          });
        }}
      />
    </>
  );
}

export function FontManager({
  fonts,
  files,
  upload,
  onChange,
  onFiles,
}: {
  fonts: FontFamily[];
  files: Readonly<Record<string, FontFile>>;
  upload: { allowed: boolean; maxBytes: number };
  onChange: (fonts: FontFamily[]) => void;
  onFiles: (added: Record<string, FontFile>) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  useLoaded(fonts, files);

  // One family for the text, one for code: choosing a use takes it from any other.
  function use(index: number, value: FontFamily["use"]) {
    onChange(
      fonts.map((font, i) =>
        i === index
          ? { ...font, use: value }
          : value !== "none" && font.use === value
            ? { ...font, use: "none" }
            : font,
      ),
    );
  }

  return (
    <div className="font-manager">
      {fonts.length > 0 ? (
        <ItemGroup variant="outline">
          {fonts.map((font, index) => (
            <Item key={font.family}>
              <ItemContent>
                <ItemTitle id={`${id}-${index}`}>{font.family}</ItemTitle>
                <ItemDescription>
                  <span className="font-manager__sample" style={{ fontFamily: `"${font.family}"` }}>
                    The quick brown fox jumps over the lazy dog
                  </span>
                </ItemDescription>
                <ItemDescription>
                  {`${font.files.length} ${font.files.length === 1 ? "file" : "files"}`}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="font-manager__actions">
                <ToggleGroup
                  type="single"
                  size="sm"
                  aria-labelledby={`${id}-${index}`}
                  value={font.use}
                  onValueChange={(value) => value && use(index, value as FontFamily["use"])}
                >
                  {USES.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button intent="ghost" size="sm" onClick={() => setDraft({ index, font })}>
                  Edit
                </Button>
                <Button
                  intent="ghost"
                  size="sm"
                  aria-label={`Remove ${font.family}`}
                  onClick={() => onChange(fonts.filter((_, i) => i !== index))}
                >
                  <TrashIcon aria-hidden="true" size={16} />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : null}
      <Button
        intent="secondary"
        className="font-manager__new"
        disabled={fonts.length >= 6}
        onClick={() => setDraft({ index: null, font: { family: "", files: [], use: "none" } })}
      >
        <PlusIcon aria-hidden="true" size={16} />
        Add a font family
      </Button>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogTitle>
            {draft?.index === null ? "Add a font family" : "Edit the family"}
          </DialogTitle>
          <DialogDescription>
            WOFF2 files you may use on a website: check the font's licence. They're served from this
            site, not from a font service.
          </DialogDescription>
          {draft ? (
            <FamilyDialog
              key={draft.index ?? "new"}
              draft={draft}
              files={files}
              upload={upload}
              others={fonts.filter((_, i) => i !== draft.index).map((f) => f.family)}
              onFiles={onFiles}
              onClose={() => setDraft(null)}
              onSave={(font) => {
                onChange(
                  draft.index === null
                    ? [...fonts, font]
                    : fonts.map((f, i) => (i === draft.index ? font : f)),
                );
                setDraft(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
