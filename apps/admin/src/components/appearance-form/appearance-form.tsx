// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { PlusIcon, TrashIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  ChoiceCardTitle,
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
  ComboboxTrigger,
  ComboboxValue,
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
  RadioCard,
  RadioGroup,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from "@nuvui/react";
import {
  CUSTOM_CSS_MAX,
  CustomCss,
  pageBackgroundTokens,
  type SettingsValue,
  THEME_PRESETS,
  THEME_TOKENS,
  TokenName,
  TokenValue,
} from "@sitebuilder/schema";
import { type CSSProperties, useEffect, useRef, useState, useTransition } from "react";
import * as v from "valibot";
import { saveTheme } from "@/actions/appearance";
import { type FontFile, FontManager } from "@/components/font-manager/font-manager";
import "./appearance-form.scss";
import {
  BACKGROUND_PRESETS,
  BRAND_TOKENS,
  brandOf,
  brandTokens,
  type Corners,
  cornersOf,
  cornerTokens,
  RADIUS_TOKENS,
  readsOnLight,
  type TokenValues,
} from "./brand";

// Appearance (design §5.4): a nuvui preset, light, dark or the visitor's own setting, how
// tall controls are, and token overrides with a value for light and one for dark. A preview
// beside the form draws nuvui components with the choices, before anything is saved.

type Theme = SettingsValue<"theme">;
type Preset = Theme["preset"];

interface TokenRow {
  key: number;
  name: string;
  light: string;
  dark: string;
}

// Brand colours most sites start from, after nuvui's appearance block.
const BRAND_PRESETS = [
  { value: "#dc2626", name: "Red" },
  { value: "#c2410c", name: "Orange" },
  { value: "#15803d", name: "Green" },
  { value: "#0f766e", name: "Teal" },
  { value: "#2563eb", name: "Blue" },
  { value: "#7c3aed", name: "Violet" },
  { value: "#1e293b", name: "Slate" },
];

const CORNER_NAMES: Record<Corners, string> = {
  theme: "The theme's",
  square: "Square",
  round: "Round",
  rounder: "Rounder",
};

// A colour as the preview draws it, as #rrggbb: a pixel painted in it and read back, which
// works for the oklch() values nuvui's presets use.
function drawnAsHex(color: string): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context || !color) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// The swatches show what each looks like, read from the preset's own tokens.
const PRESET_NAMES: Record<Preset, string> = {
  default: "Default",
  ember: "Ember",
  "high-contrast": "High contrast",
  ink: "Ink",
  ledger: "Ledger",
  meadow: "Meadow",
};

function rowsOf(tokens: Theme["tokens"]): TokenRow[] {
  return Object.entries(tokens).map(([name, values], key) => ({
    key,
    name,
    light: values.light ?? "",
    dark: values.dark ?? "",
  }));
}

function rowProblem(row: TokenRow): string | null {
  if (!v.is(TokenName, row.name)) return "Choose a token.";
  for (const value of [row.light, row.dark]) {
    if (value && !v.is(TokenValue, value))
      return "Use a plain CSS value, such as #0f766e or 0.5rem.";
  }
  if (!row.light && !row.dark) return "Give a value for light, dark or both.";
  return null;
}

export function AppearanceForm({
  initial,
  fontFiles,
  upload,
}: {
  initial: Theme;
  // The saved fonts' files, by media id.
  fontFiles: Record<string, FontFile>;
  // Whether the viewer may upload, for adding font files.
  upload: { allowed: boolean; maxBytes: number };
}) {
  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [mode, setMode] = useState<Theme["mode"]>(initial.mode);
  const [density, setDensity] = useState<Theme["density"]>(initial.density);
  const [rows, setRows] = useState<TokenRow[]>(() => rowsOf(initial.tokens));
  const [pageBackground, setPageBackground] = useState(initial.pageBackground);
  const [customCss, setCustomCss] = useState(initial.customCss);
  const [fonts, setFonts] = useState(initial.fonts);
  const [files, setFiles] = useState(fontFiles);
  const cssCheck = v.safeParse(CustomCss, customCss);
  const cssProblem = cssCheck.success ? undefined : cssCheck.issues[0].message;
  const [previewDark, setPreviewDark] = useState(initial.mode === "dark");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const problems = new Map(rows.map((row) => [row.key, rowProblem(row)]));
  const shownMode = mode === "system" ? (previewDark ? "dark" : "light") : mode;

  // The overrides, as variables on the preview: the shown mode's value, else the light one,
  // which also holds in dark (nuvui's theming page).
  // With a page background, the palette it takes (page-background.ts) instead.
  const validRows = rows.filter((row) => !problems.get(row.key));
  const previewStyle = Object.fromEntries(
    pageBackground
      ? pageBackgroundTokens(pageBackground, {
          preset,
          tokens: Object.fromEntries(
            validRows.map((row) => [
              row.name,
              {
                ...(row.light ? { light: row.light } : {}),
                ...(row.dark ? { dark: row.dark } : {}),
              },
            ]),
          ),
        }).map(([name, value]) => [name === "color-scheme" ? "colorScheme" : name, value])
      : validRows.flatMap((row) => {
          const value = shownMode === "dark" ? row.dark || row.light : row.light;
          return value ? [[row.name, value]] : [];
        }),
  ) as CSSProperties;

  function update(key: number, patch: Partial<TokenRow>) {
    setRows((now) => now.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  // Writes token values into the rows: changes the ones there, adds the rest.
  function applyTokens(values: TokenValues) {
    setRows((now) => {
      const next = now.map((row) => {
        const value = values[row.name];
        return value ? { ...row, light: value.light, dark: value.dark } : row;
      });
      let key = Math.max(-1, ...now.map((row) => row.key));
      for (const [name, value] of Object.entries(values)) {
        if (!next.some((row) => row.name === name)) next.push({ key: ++key, name, ...value });
      }
      return next;
    });
  }

  function removeTokens(names: readonly string[]) {
    setRows((now) => now.filter((row) => !names.includes(row.name)));
  }

  const lightValues = new Map(rows.map((row) => [row.name, row.light]));
  const brand = brandOf(lightValues.get("--color-primary"));
  const corners = cornersOf(lightValues);

  // With no brand colour of its own, the picker starts from the theme's, as the preview draws it.
  const preview = useRef<HTMLDivElement>(null);
  const [themePrimary, setThemePrimary] = useState("#2563eb");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the preset and the mode change what the preview draws.
  useEffect(() => {
    if (brand || !preview.current) return;
    const value = getComputedStyle(preview.current).getPropertyValue("--color-primary").trim();
    const drawn = drawnAsHex(value);
    if (drawn) setThemePrimary(drawn);
  }, [brand, preset, shownMode]);

  function save() {
    if (cssProblem) {
      setProblem(`Custom CSS: ${cssProblem}`);
      return;
    }
    if ([...problems.values()].some(Boolean)) {
      setProblem("A token row isn't complete. Check the marked rows.");
      return;
    }
    const names = rows.map((row) => row.name);
    if (new Set(names).size !== names.length) {
      setProblem("A token is listed twice. Keep one row for each.");
      return;
    }
    const tokens = Object.fromEntries(
      rows.map((row) => [
        row.name,
        { ...(row.light ? { light: row.light } : {}), ...(row.dark ? { dark: row.dark } : {}) },
      ]),
    );
    setProblem(null);
    startSave(async () => {
      const result = await saveTheme({
        preset,
        mode,
        density,
        tokens,
        pageBackground,
        customCss,
        fonts,
      });
      if (result.ok)
        toast("Appearance saved. The site shows it on the next page load.", { intent: "success" });
      else setProblem(result.error);
    });
  }

  return (
    <div className="appearance-form">
      <div className="appearance-form__settings">
        {problem ? (
          <Alert intent="warning" role="alert">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}

        <section className="appearance-form__section" aria-labelledby="appearance-preset">
          <h2 id="appearance-preset" className="appearance-form__heading">
            Theme
          </h2>
          <RadioGroup
            value={preset}
            onValueChange={(value) => setPreset(value as Preset)}
            aria-labelledby="appearance-preset"
            className="appearance-form__presets"
          >
            {THEME_PRESETS.map((option) => (
              <RadioCard key={option} value={option}>
                <span
                  className="appearance-form__swatches"
                  aria-hidden="true"
                  {...(option === "default" ? {} : { "data-preset": option })}
                >
                  <span className="appearance-form__swatch appearance-form__swatch--primary" />
                  <span className="appearance-form__swatch appearance-form__swatch--muted" />
                  <span className="appearance-form__swatch appearance-form__swatch--border" />
                </span>
                <ChoiceCardTitle>{PRESET_NAMES[option]}</ChoiceCardTitle>
              </RadioCard>
            ))}
          </RadioGroup>
        </section>

        <section className="appearance-form__section" aria-labelledby="appearance-brand">
          <h2 id="appearance-brand" className="appearance-form__heading">
            Colours and corners
          </h2>
          <ItemGroup variant="outline">
            <Item>
              <ItemContent>
                <ItemTitle id="appearance-brand-title">Brand colour</ItemTitle>
                <ItemDescription id="appearance-brand-about">
                  Buttons, links and focus rings. The text on it is chosen to be readable, and dark
                  pages get a lighter shade of it.
                </ItemDescription>
              </ItemContent>
              <ItemActions className="appearance-form__brand-actions">
                {brand ? (
                  <Button intent="ghost" size="sm" onClick={() => removeTokens(BRAND_TOKENS)}>
                    Use the theme's
                  </Button>
                ) : null}
                <ColorPicker
                  value={brand ?? themePrimary}
                  onValueChange={(color) => applyTokens(brandTokens(color))}
                >
                  <ColorPickerTrigger
                    aria-labelledby="appearance-brand-title"
                    aria-describedby="appearance-brand-about"
                  >
                    {brand ? undefined : "The theme's"}
                  </ColorPickerTrigger>
                  <ColorPickerContent align="end">
                    <ColorPickerArea />
                    <ColorPickerHue />
                    <ColorPickerInput />
                    <ColorPickerSwatches aria-label="Brand colours">
                      {BRAND_PRESETS.map((option) => (
                        <ColorPickerSwatch
                          key={option.value}
                          value={option.value}
                          aria-label={option.name}
                        />
                      ))}
                    </ColorPickerSwatches>
                  </ColorPickerContent>
                </ColorPicker>
              </ItemActions>
            </Item>
            <Item>
              <ItemContent>
                <ItemTitle id="appearance-corners-title">Corners</ItemTitle>
                <ItemDescription>How round buttons, fields and cards are.</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ToggleGroup
                  type="single"
                  value={corners ?? ""}
                  onValueChange={(value) => {
                    if (value === "theme") removeTokens(RADIUS_TOKENS);
                    else if (value) applyTokens(cornerTokens(value as Exclude<Corners, "theme">));
                  }}
                  aria-labelledby="appearance-corners-title"
                >
                  {(Object.keys(CORNER_NAMES) as Corners[]).map((value) => (
                    <ToggleGroupItem key={value} value={value}>
                      {CORNER_NAMES[value]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ItemActions>
            </Item>
            <Item>
              <ItemContent>
                <ItemTitle id="appearance-background-title">Page background</ItemTitle>
                <ItemDescription id="appearance-background-about">
                  Behind every page and post without a colour of its own. Text and lines are set to
                  read on it, and a light colour shows pages light even in dark mode.
                </ItemDescription>
              </ItemContent>
              <ItemActions className="appearance-form__brand-actions">
                {pageBackground ? (
                  <Button intent="ghost" size="sm" onClick={() => setPageBackground(null)}>
                    Use the theme's
                  </Button>
                ) : null}
                <ColorPicker value={pageBackground ?? "#ffffff"} onValueChange={setPageBackground}>
                  <ColorPickerTrigger
                    aria-labelledby="appearance-background-title"
                    aria-describedby="appearance-background-about"
                  >
                    {pageBackground ? undefined : "The theme's"}
                  </ColorPickerTrigger>
                  <ColorPickerContent align="end">
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
              </ItemActions>
            </Item>
          </ItemGroup>
          {/* In the page from the start, so a screen reader hears it when it appears. */}
          <p role="status" className="appearance-form__note">
            {brand && !readsOnLight(brand)
              ? "Links in this colour are hard to read on a light page. A darker shade reads better."
              : ""}
          </p>
        </section>

        <div className="appearance-form__pair">
          <section className="appearance-form__section" aria-labelledby="appearance-mode">
            <h2 id="appearance-mode" className="appearance-form__heading">
              Light or dark
            </h2>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => value && setMode(value as Theme["mode"])}
              aria-labelledby="appearance-mode"
            >
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              <ToggleGroupItem value="system">The visitor's setting</ToggleGroupItem>
            </ToggleGroup>
          </section>
          <section className="appearance-form__section" aria-labelledby="appearance-density">
            <h2 id="appearance-density" className="appearance-form__heading">
              Density
            </h2>
            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(value) => value && setDensity(value as Theme["density"])}
              aria-labelledby="appearance-density"
            >
              <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
              <ToggleGroupItem value="default">Default</ToggleGroupItem>
              <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
            </ToggleGroup>
          </section>
        </div>

        <section className="appearance-form__section" aria-labelledby="appearance-tokens">
          <h2 id="appearance-tokens" className="appearance-form__heading">
            Advanced: each value
          </h2>
          <p className="appearance-form__note">
            The brand colour and corners above are written here too. Each row replaces one of the
            theme's values. A light value holds in dark too unless dark has its own. Colors pair up:
            check that text still reads on what you change.
          </p>
          {rows.length > 0 ? (
            <ul className="appearance-form__tokens">
              {rows.map((row) => {
                const issue = problems.get(row.key);
                return (
                  <li key={row.key} className="appearance-form__token">
                    <Field>
                      <FieldLabel>Token</FieldLabel>
                      <Combobox
                        value={row.name}
                        onValueChange={(name) => update(row.key, { name })}
                      >
                        <FieldControl>
                          <ComboboxTrigger>
                            <ComboboxValue placeholder="Choose a token" />
                          </ComboboxTrigger>
                        </FieldControl>
                        <ComboboxContent
                          label="Search tokens"
                          searchPlaceholder="color, radius, font"
                        >
                          <ComboboxEmpty>No token found.</ComboboxEmpty>
                          {THEME_TOKENS.map((name) => (
                            <ComboboxItem key={name} value={name}>
                              {name}
                            </ComboboxItem>
                          ))}
                        </ComboboxContent>
                      </Combobox>
                    </Field>
                    <Field>
                      <FieldLabel>Light</FieldLabel>
                      <FieldControl>
                        <Input
                          value={row.light}
                          onChange={(event) =>
                            update(row.key, { light: event.currentTarget.value })
                          }
                          placeholder="#0f766e"
                          spellCheck={false}
                        />
                      </FieldControl>
                    </Field>
                    <Field>
                      <FieldLabel>Dark</FieldLabel>
                      <FieldControl>
                        <Input
                          value={row.dark}
                          onChange={(event) => update(row.key, { dark: event.currentTarget.value })}
                          placeholder="Same as light"
                          spellCheck={false}
                        />
                      </FieldControl>
                    </Field>
                    <Button
                      intent="ghost"
                      className="appearance-form__remove"
                      aria-label={`Remove ${row.name || "this token"}`}
                      onClick={() => setRows((now) => now.filter((r) => r.key !== row.key))}
                    >
                      <TrashIcon aria-hidden="true" size={16} />
                    </Button>
                    {issue ? <p className="appearance-form__problem">{issue}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Button
            intent="secondary"
            className="appearance-form__add"
            disabled={rows.length >= THEME_TOKENS.length}
            onClick={() =>
              setRows((now) => [
                ...now,
                { key: Math.max(-1, ...now.map((r) => r.key)) + 1, name: "", light: "", dark: "" },
              ])
            }
          >
            <PlusIcon aria-hidden="true" size={16} />
            Add a token
          </Button>
        </section>

        <section className="appearance-form__section" aria-labelledby="appearance-fonts">
          <h2 id="appearance-fonts" className="appearance-form__heading">
            Fonts
          </h2>
          <p className="appearance-form__note">
            Fonts of your own, from WOFF2 files. Choose one for the text and one for code. With the
            default template, its Fonts option uses them when set to the theme's.
          </p>
          <FontManager
            fonts={fonts}
            files={files}
            upload={upload}
            onChange={setFonts}
            onFiles={(added) => setFiles((now) => ({ ...now, ...added }))}
          />
        </section>

        <section className="appearance-form__section" aria-labelledby="appearance-css">
          <h2 id="appearance-css" className="appearance-form__heading">
            Custom CSS
          </h2>
          <Field>
            <FieldLabel>Stylesheet</FieldLabel>
            <FieldControl>
              <Textarea
                value={customCss}
                rows={10}
                autoResize
                spellCheck={false}
                maxLength={CUSTOM_CSS_MAX}
                className="appearance-form__css"
                placeholder={
                  ".site-header {\n  border-block-end: 2px solid var(--color-primary);\n}"
                }
                onChange={(event) => setCustomCss(event.currentTarget.value)}
              />
            </FieldControl>
            <FieldDescription>
              Added to every page of the site after the theme and the template, and in the editor's
              canvas. Use the theme's variables, such as var(--color-primary), so it follows light
              and dark. Images, fonts and imports from other sites are blocked by the site's
              security policy.
            </FieldDescription>
            <FieldError>{cssProblem}</FieldError>
          </Field>
        </section>

        <Button
          className="appearance-form__save"
          onClick={save}
          disabled={saving}
          aria-busy={saving}
        >
          Save appearance
        </Button>
      </div>

      <section className="appearance-form__preview-wrap" aria-labelledby="appearance-preview">
        <div className="appearance-form__preview-head">
          <h2 id="appearance-preview" className="appearance-form__heading">
            Preview
          </h2>
          {mode === "system" ? (
            <Field orientation="horizontal">
              <FieldControl>
                <Switch checked={previewDark} onCheckedChange={setPreviewDark} />
              </FieldControl>
              <FieldLabel>Show dark</FieldLabel>
            </Field>
          ) : null}
        </div>
        <div
          ref={preview}
          className="appearance-form__preview"
          data-theme={shownMode}
          data-density={density}
          {...(preset === "default" ? {} : { "data-preset": preset })}
          style={previewStyle}
        >
          <p className="appearance-form__preview-title">A heading on the site</p>
          <p className="appearance-form__preview-text">
            Body text, with <a href="#appearance-preview">words that link to a page</a> and{" "}
            <span className="appearance-form__preview-muted">quieter words</span>.
          </p>
          <div className="appearance-form__preview-row">
            <Button type="button">Primary</Button>
            <Button type="button" intent="secondary">
              Secondary
            </Button>
            <Badge>Badge</Badge>
          </div>
          <Field>
            <FieldLabel>A field</FieldLabel>
            <FieldControl>
              <Input placeholder="Type here" />
            </FieldControl>
          </Field>
          <Alert intent="info">
            <AlertDescription>A message on the page.</AlertDescription>
          </Alert>
        </div>
      </section>
    </div>
  );
}
