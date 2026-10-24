// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  ChoiceCardDescription,
  ChoiceCardTitle,
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
  NumberField,
  PasswordInput,
  RadioCard,
  RadioGroup,
  toast,
} from "@nuvui/react";
import type { AiModel, AiSettingsView } from "@sitebuilder/ai";
import { type FormEvent, useState, useTransition } from "react";
import {
  type AiField,
  type AiFormResult,
  type AiFormValues,
  saveAiSettings,
  testAiConnection,
} from "@/actions/ai-settings";
import "./ai-settings-form.scss";

type Provider = AiFormValues["provider"];

const PROVIDERS: { value: Provider; title: string; description: string }[] = [
  { value: "off", title: "Off", description: "No assistant. Nothing is sent anywhere." },
  {
    value: "anthropic",
    title: "Anthropic",
    description: "Claude models, with an API key from your Anthropic account.",
  },
  {
    value: "openai",
    title: "OpenAI",
    description: "GPT models, with an API key from your OpenAI account.",
  },
  {
    value: "ollama",
    title: "Ollama",
    description:
      "Open models on a server you run, on this machine, your network or elsewhere, or on Ollama's cloud.",
  },
];

const KEY_HINT: Record<Exclude<Provider, "off">, string> = {
  anthropic: "Stored encrypted, and never shown again.",
  openai: "Stored encrypted, and never shown again.",
  ollama:
    "Only if the server asks for one. Ollama's cloud does; a server of your own usually doesn't.",
};

// The saved model as the one choice until the provider's list is fetched.
const savedModels = (view: AiSettingsView): AiModel[] =>
  view.model ? [{ id: view.model, label: view.model }] : [];

// Settings → AI (templates_and_ai_design B3). An admin picks a provider, gives its key (and for
// Ollama its address), connects to list the models the key can use, and picks one. Save
// connects again before it stores anything. The fields are held here, not in a form action,
// so connecting doesn't reset what was typed.
export function AiSettingsForm({
  initial,
  allowPrivate,
  locale,
}: {
  initial: AiSettingsView;
  // Whether the server may reach this machine and private networks (AI_ALLOW_PRIVATE_URLS).
  allowPrivate: boolean;
  locale: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [models, setModels] = useState<AiModel[]>(savedModels(initial));
  const [limit, setLimit] = useState<number | null>(initial.dailyTokenLimit);
  const [images, setImages] = useState(initial.supportsImages);
  const [result, setResult] = useState<AiFormResult | null>(null);
  const [busy, setBusy] = useState<"connect" | "save" | null>(null);
  const [, startTransition] = useTransition();

  const errors = result && !result.ok ? (result.errors ?? {}) : {};
  const error = (field: AiField) => errors[field];
  // The key saved for what's chosen now: another provider, or another Ollama server, needs its own.
  const keySaved =
    saved.key !== "none" &&
    saved.provider === provider &&
    (provider !== "ollama" || saved.baseUrl === baseUrl)
      ? saved.key
      : "none";

  const values = (): AiFormValues => ({
    provider,
    key,
    baseUrl,
    model,
    dailyTokenLimit: limit,
    supportsImages: images,
  });

  function choose(next: Provider) {
    setProvider(next);
    setResult(null);
    const back = next === saved.provider;
    setModels(back ? savedModels(saved) : []);
    setModel(back ? saved.model : "");
  }

  function run(kind: "connect" | "save") {
    setBusy(kind);
    startTransition(async () => {
      const answer = await (kind === "connect" ? testAiConnection : saveAiSettings)(values());
      setBusy(null);
      setResult(answer);
      if (!answer.ok) return;
      setModels(answer.models);
      if (kind === "connect" && !answer.models.some((m) => m.id === model)) setModel("");
      if (answer.view) {
        setSaved(answer.view);
        setKey("");
        setResult(null);
        toast(answer.message, { intent: "success" });
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run("save");
  }

  const chosen = models.find((m) => m.id === model);

  return (
    <form className="ai-settings-form" onSubmit={submit} noValidate>
      <div className="ai-settings-form__choices">
        <span id="ai-provider" className="ai-settings-form__label">
          Provider
        </span>
        <RadioGroup
          value={provider}
          onValueChange={(value) => choose(value as Provider)}
          aria-labelledby="ai-provider"
          className="ai-settings-form__cards"
        >
          {PROVIDERS.map((item) => (
            <RadioCard key={item.value} value={item.value}>
              <ChoiceCardTitle>{item.title}</ChoiceCardTitle>
              <ChoiceCardDescription>{item.description}</ChoiceCardDescription>
            </RadioCard>
          ))}
        </RadioGroup>
      </div>

      {provider !== "off" ? (
        <div className="ai-settings-form__details">
          {provider === "ollama" ? (
            <Field required>
              <FieldLabel>Server address</FieldLabel>
              <FieldControl>
                <Input
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="http://localhost:11434"
                  spellCheck={false}
                />
              </FieldControl>
              <FieldDescription>
                {allowPrivate
                  ? "Ollama on this machine is http://localhost:11434 (from inside Docker, http://host.docker.internal:11434). Ollama's cloud is https://ollama.com."
                  : "An https address on the internet, such as https://ollama.com for Ollama's cloud. For Ollama on this machine or your network, whoever runs the site sets AI_ALLOW_PRIVATE_URLS=true."}
              </FieldDescription>
              <FieldError>{error("baseUrl")}</FieldError>
            </Field>
          ) : null}

          <Field required={provider !== "ollama" && keySaved !== "saved"}>
            <FieldLabel>API key</FieldLabel>
            <FieldControl>
              <PasswordInput
                value={key}
                onChange={(event) => setKey(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                showLabel="Show key"
                hideLabel="Hide key"
              />
            </FieldControl>
            <FieldDescription>
              {keySaved === "saved"
                ? `A key ending in ${saved.keyLast4} is saved. Leave this empty to keep it.`
                : keySaved === "unreadable"
                  ? "The saved key can't be read any more (the server's secret changed). Enter it again."
                  : KEY_HINT[provider]}
            </FieldDescription>
            <FieldError>{error("key")}</FieldError>
          </Field>

          <div className="ai-settings-form__connect">
            <Button
              intent="secondary"
              onClick={() => run("connect")}
              disabled={busy !== null}
              aria-busy={busy === "connect"}
            >
              {busy === "connect" ? "Connecting…" : "Connect"}
            </Button>
          </div>

          <Field required>
            <FieldLabel>Model</FieldLabel>
            <Combobox value={model} onValueChange={setModel} disabled={models.length === 0}>
              <FieldControl>
                <ComboboxTrigger className="ai-settings-form__model">
                  <ComboboxValue placeholder="Connect to list the models">
                    {chosen?.label}
                  </ComboboxValue>
                </ComboboxTrigger>
              </FieldControl>
              <ComboboxContent aria-label="Model" label="Search models" searchPlaceholder="Search">
                <ComboboxEmpty>No model found.</ComboboxEmpty>
                {models.map((item) => (
                  <ComboboxItem
                    key={item.id}
                    value={item.id}
                    textValue={item.label}
                    keywords={[item.id]}
                  >
                    {item.label}
                  </ComboboxItem>
                ))}
              </ComboboxContent>
            </Combobox>
            <FieldDescription>
              From the provider's own list, so it's one this key can use.
            </FieldDescription>
            <FieldError>{error("model")}</FieldError>
          </Field>

          <Field required>
            <FieldLabel>Daily token limit</FieldLabel>
            <FieldControl>
              <NumberField
                value={limit}
                onValueChange={setLimit}
                min={10_000}
                max={100_000_000}
                step={100_000}
                format={{ locale }}
                className="ai-settings-form__limit"
              />
            </FieldControl>
            <FieldDescription>
              For the whole site, per day (UTC): what's sent to the provider and what comes back.
              The assistant stops for the day when it's reached.
            </FieldDescription>
            <FieldError>{error("dailyTokenLimit")}</FieldError>
          </Field>

          <Field orientation="horizontal">
            <FieldControl>
              <Checkbox checked={images} onCheckedChange={(state) => setImages(state === true)} />
            </FieldControl>
            <FieldLabel>This model accepts images</FieldLabel>
            <FieldDescription>
              Tick it if the model can read pictures; the assistant then offers to write alt text.
            </FieldDescription>
          </Field>
        </div>
      ) : null}

      {result ? (
        <Alert intent={result.ok ? "success" : "danger"} role={result.ok ? "status" : "alert"}>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="ai-settings-form__actions">
        <Button type="submit" disabled={busy !== null} aria-busy={busy === "save"}>
          {busy === "save" ? "Saving…" : "Save AI settings"}
        </Button>
      </div>
    </form>
  );
}
