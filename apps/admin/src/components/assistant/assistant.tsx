// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { SparklesIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Spinner,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@nuvui/react";
import { getBlockDefinition } from "@sitebuilder/blocks";
import { type Block, type EntryKind, HELP_INSTRUCTION_MAX } from "@sitebuilder/schema";
import { createContext, type ReactNode, useContext, useId, useRef, useState } from "react";
import "./assistant.scss";

// Help on a page in the editor (phase 8 plan, 8.7): rewrite the selected block or the whole page
// from an instruction, suggest the search title and description, describe a picture. Every
// answer is a proposal: a rewrite shows in the canvas until it's accepted or discarded, and the
// others wait beside their fields. Nothing here changes the page on its own.

export interface AssistantAvailability {
  // Set up in Settings, and help allowed on this entry.
  available: boolean;
  // The model takes pictures (alt text).
  images: boolean;
}

// What a request says about the entry: read when it's sent, so it's the editor's latest.
export interface EntrySnapshot {
  entryId: string;
  type: EntryKind;
  title: string;
  content: readonly Block[];
}

type Reply<T> = ({ ok: true } & T) | { ok: false; error: string };

async function help<T>(body: Record<string, unknown>): Promise<Reply<T>> {
  try {
    const response = await fetch("/admin/api/ai/help", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as Reply<T> | null;
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, error: "Something went wrong. Try again." };
  } catch {
    return { ok: false, error: "The server couldn't be reached. Try again." };
  }
}

interface AssistantValue extends AssistantAvailability {
  ask: <T>(kind: "rewrite" | "seo" | "alt", extra: Record<string, unknown>) => Promise<Reply<T>>;
}

const AssistantContext = createContext<AssistantValue>({
  available: false,
  images: false,
  ask: async () => ({ ok: false, error: "The assistant isn't available." }),
});

export function AssistantProvider({
  availability,
  snapshot,
  children,
}: {
  availability: AssistantAvailability;
  snapshot: () => EntrySnapshot;
  children: ReactNode;
}) {
  const current = useRef(snapshot);
  current.current = snapshot;
  const value: AssistantValue = {
    ...availability,
    ask: (kind, extra) => help({ kind, ...current.current(), ...extra }),
  };
  return <AssistantContext value={value}>{children}</AssistantContext>;
}

export const useAssistant = () => useContext(AssistantContext);

// ── The Assistant tab ────────────────────────────────────────────────────────────────────────

export interface RewriteProposal {
  blocks: Block[];
  // The block it takes the place of, or null for the whole page.
  replaces: string | null;
  // What was rewritten, for the bar above the canvas.
  label: string;
}

export interface SeoProposal {
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
}

const QUICK = [
  "Make it shorter",
  "Make it friendlier",
  "Fix spelling and grammar",
  "Simpler words",
];

export function AssistantPanel({
  selected,
  proposing,
  onRewrite,
  onSeo,
}: {
  // The selected block (a column means its columns), if any.
  selected: Block | undefined;
  // A rewrite is waiting in the canvas.
  proposing: boolean;
  onRewrite: (proposal: RewriteProposal) => void;
  onSeo: (proposal: SeoProposal) => void;
}) {
  const id = useId();
  const { ask } = useAssistant();
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<"block" | "page">("block");
  const [busy, setBusy] = useState<"rewrite" | "seo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoProposal | null>(null);

  const target = scope === "block" ? selected : undefined;
  const targetLabel = selected ? (getBlockDefinition(selected.type)?.label ?? selected.type) : null;

  async function rewrite() {
    setBusy("rewrite");
    setError(null);
    const reply = await ask<{ blocks: Block[]; replaces: string | null }>("rewrite", {
      instruction,
      ...(target ? { blockId: target.id } : {}),
    });
    setBusy(null);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    onRewrite({
      blocks: reply.blocks,
      replaces: target ? reply.replaces : null,
      label: target ? `the ${targetLabel?.toLowerCase() ?? "block"}` : "the whole page",
    });
  }

  async function suggestSeo() {
    setBusy("seo");
    setError(null);
    const reply = await ask<SeoProposal>("seo", {});
    setBusy(null);
    if (reply.ok) {
      setSeo({
        seoTitle: reply.seoTitle,
        seoDescription: reply.seoDescription,
        excerpt: reply.excerpt,
      });
    } else setError(reply.error);
  }

  return (
    <div className="assistant">
      <p className="assistant__about">
        The assistant suggests; you decide. A rewrite shows in the page until you accept or discard
        it, and nothing is saved until you save.
      </p>
      {error ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="assistant__section" aria-labelledby={`${id}-rewrite`}>
        <h2 id={`${id}-rewrite`} className="assistant__heading">
          Rewrite
        </h2>
        <div className="assistant__scope">
          <span id={`${id}-scope`} className="assistant__label">
            What to rewrite
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            aria-labelledby={`${id}-scope`}
            value={selected ? scope : "page"}
            onValueChange={(next) => next && setScope(next as "block" | "page")}
          >
            <ToggleGroupItem value="block" disabled={!selected}>
              {targetLabel ? `This ${targetLabel.toLowerCase()}` : "A block"}
            </ToggleGroupItem>
            <ToggleGroupItem value="page">The whole page</ToggleGroupItem>
          </ToggleGroup>
          {!selected ? (
            <p className="assistant__hint">Select a block in the page to rewrite it alone.</p>
          ) : null}
        </div>
        <Field>
          <FieldLabel>What to change</FieldLabel>
          <FieldControl>
            <Textarea
              value={instruction}
              rows={3}
              autoResize
              maxLength={HELP_INSTRUCTION_MAX}
              placeholder="Make it warmer, and mention we deliver on Saturdays."
              onChange={(event) => setInstruction(event.currentTarget.value)}
            />
          </FieldControl>
          <FieldDescription>
            The page's facts stay as they are: the assistant won't add numbers, addresses or prices
            you haven't written.
          </FieldDescription>
        </Field>
        <div className="assistant__quick">
          {QUICK.map((text) => (
            <Button key={text} intent="ghost" size="sm" onClick={() => setInstruction(text)}>
              {text}
            </Button>
          ))}
        </div>
        <Button
          onClick={rewrite}
          disabled={busy !== null || proposing || !instruction.trim()}
          aria-busy={busy === "rewrite"}
        >
          {busy === "rewrite" ? (
            <Spinner size="sm" label="" />
          ) : (
            <SparklesIcon aria-hidden="true" size={16} />
          )}
          Rewrite
        </Button>
        {proposing ? (
          <p className="assistant__hint">Accept or discard the rewrite in the page first.</p>
        ) : null}
      </section>

      <section className="assistant__section" aria-labelledby={`${id}-seo`}>
        <h2 id={`${id}-seo`} className="assistant__heading">
          Search engines
        </h2>
        <p className="assistant__hint">
          A title and description for search results, and an excerpt for lists, from the page.
        </p>
        <Button
          intent="secondary"
          onClick={suggestSeo}
          disabled={busy !== null}
          aria-busy={busy === "seo"}
        >
          {busy === "seo" ? <Spinner size="sm" label="" /> : null}
          Suggest
        </Button>
        {seo ? (
          <div className="assistant__proposal" role="status">
            <dl className="assistant__seo">
              <dt className="assistant__term">Title</dt>
              <dd className="assistant__value">{seo.seoTitle}</dd>
              <dt className="assistant__term">Description</dt>
              <dd className="assistant__value">{seo.seoDescription}</dd>
              {seo.excerpt ? (
                <>
                  <dt className="assistant__term">Excerpt</dt>
                  <dd className="assistant__value">{seo.excerpt}</dd>
                </>
              ) : null}
            </dl>
            <div className="assistant__actions">
              <Button intent="ghost" size="sm" onClick={() => setSeo(null)}>
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSeo(seo);
                  setSeo(null);
                }}
              >
                Use these
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ── Alt text, beside an alt field ────────────────────────────────────────────────────────────

export function AltSuggestion({
  mediaId,
  max,
  onUse,
}: {
  mediaId: string;
  max: number;
  // The alt to use: words, or "" for a picture that only decorates.
  onUse: (alt: string) => void;
}) {
  const { images, available, ask } = useAssistant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  if (!available || !images) return null;

  async function suggest() {
    setBusy(true);
    setError(null);
    const reply = await ask<{ alt: string }>("alt", { mediaId, max });
    setBusy(false);
    if (reply.ok) setSuggestion(reply.alt);
    else setError(reply.error);
  }

  return (
    <div className="assistant__alt">
      <Button intent="ghost" size="sm" onClick={suggest} disabled={busy} aria-busy={busy}>
        {busy ? <Spinner size="sm" label="" /> : <SparklesIcon aria-hidden="true" size={16} />}
        Suggest alt text
      </Button>
      {error ? (
        <p className="assistant__error" role="alert">
          {error}
        </p>
      ) : null}
      {suggestion !== null ? (
        <div className="assistant__proposal" role="status">
          <p className="assistant__suggested">
            {suggestion || "Decoration only: no alt text, so screen readers skip it."}
          </p>
          <div className="assistant__actions">
            <Button intent="ghost" size="sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onUse(suggestion);
                setSuggestion(null);
              }}
            >
              Use it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
