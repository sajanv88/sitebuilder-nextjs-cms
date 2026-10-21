"use client";

import { PlusIcon, TrashIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  ChoiceCardTitle,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  RadioCard,
  RadioGroup,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from "@nuvui/react";
import {
  type SettingsValue,
  THEME_PRESETS,
  THEME_TOKENS,
  TokenName,
  TokenValue,
} from "@sitebuilder/schema";
import { type CSSProperties, useState, useTransition } from "react";
import * as v from "valibot";
import { saveTheme } from "@/actions/appearance";
import "./appearance-form.scss";

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

export function AppearanceForm({ initial }: { initial: Theme }) {
  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [mode, setMode] = useState<Theme["mode"]>(initial.mode);
  const [density, setDensity] = useState<Theme["density"]>(initial.density);
  const [rows, setRows] = useState<TokenRow[]>(() => rowsOf(initial.tokens));
  const [previewDark, setPreviewDark] = useState(initial.mode === "dark");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const problems = new Map(rows.map((row) => [row.key, rowProblem(row)]));
  const shownMode = mode === "system" ? (previewDark ? "dark" : "light") : mode;

  // The overrides, as variables on the preview: the shown mode's value, else the light one,
  // which also holds in dark (nuvui's theming page).
  const previewStyle = Object.fromEntries(
    rows.flatMap((row) => {
      if (problems.get(row.key)) return [];
      const value = shownMode === "dark" ? row.dark || row.light : row.light;
      return value ? [[row.name, value]] : [];
    }),
  ) as CSSProperties;

  function update(key: number, patch: Partial<TokenRow>) {
    setRows((now) => now.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function save() {
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
      const result = await saveTheme({ preset, mode, density, tokens });
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
            Your own colors and corners
          </h2>
          <p className="appearance-form__note">
            Each row replaces one of the theme's values. A light value holds in dark too unless dark
            has its own. Colors pair up: check that text still reads on what you change.
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
