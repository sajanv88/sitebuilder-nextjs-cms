// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { AI_ERROR_MESSAGES } from "../src/errors";
import { guardedFetch } from "../src/outbound";
import { createProvider, withRetries } from "../src/provider";
import type { AiConnection, AiResult, Generated, OutputSchema } from "../src/types";

// Checks each adapter against the real provider, by hand, never in CI (templates_and_ai_design
// B12): it lists the models, then asks for one small structured answer. It costs a fraction of
// a cent per provider. Keys come from the shell's environment, never from a file:
//
//   ANTHROPIC_API_KEY [ANTHROPIC_MODEL]          default model claude-opus-5-5
//   OPENAI_API_KEY OPENAI_MODEL                  without a model, only the list is checked
//   OLLAMA_URL OLLAMA_MODEL [OLLAMA_API_KEY]     a local server needs AI_ALLOW_PRIVATE_URLS=true
//
//   pnpm ai:live-check
//
// Spike S4 (phase 8) grows this into ten site briefs through the real validator.

const output: OutputSchema = {
  name: "page_outline",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "sections"],
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "text"],
          properties: { heading: { type: "string" }, text: { type: "string" } },
        },
      },
    },
  },
};

const say = (line: string) =>
  process.stdout.write(`${line}
`);

interface Target {
  connection: AiConnection;
  model: string | undefined;
}

function targets(env: NodeJS.ProcessEnv): Target[] {
  const found: Target[] = [];
  if (env.ANTHROPIC_API_KEY) {
    found.push({
      connection: { provider: "anthropic", key: env.ANTHROPIC_API_KEY },
      model: env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    });
  }
  if (env.OPENAI_API_KEY) {
    found.push({
      connection: { provider: "openai", key: env.OPENAI_API_KEY },
      model: env.OPENAI_MODEL,
    });
  }
  if (env.OLLAMA_URL) {
    found.push({
      connection: {
        provider: "ollama",
        baseUrl: env.OLLAMA_URL,
        ...(env.OLLAMA_API_KEY ? { key: env.OLLAMA_API_KEY } : {}),
      },
      model: env.OLLAMA_MODEL,
    });
  }
  return found;
}

const describe = <T>(result: AiResult<T> & { ok: false }) =>
  `${result.error.code}: ${AI_ERROR_MESSAGES[result.error.code]}${result.error.detail ? ` (${result.error.detail})` : ""}`;

function shapeIsRight(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const { title, sections } = value as { title?: unknown; sections?: unknown };
  return (
    typeof title === "string" &&
    Array.isArray(sections) &&
    sections.every(
      (s) =>
        s !== null &&
        typeof s === "object" &&
        typeof (s as { heading?: unknown }).heading === "string" &&
        typeof (s as { text?: unknown }).text === "string",
    )
  );
}

async function check({ connection, model }: Target, allowPrivate: boolean): Promise<boolean> {
  const provider = withRetries(createProvider(connection, guardedFetch({ allowPrivate })));
  say(`\n${connection.provider}`);

  const listed = await provider.listModels(AbortSignal.timeout(20_000));
  if (!listed.ok) {
    say(`  models   failed  ${describe(listed)}`);
    return false;
  }
  say(`  models   ok      ${listed.value.length} listed`);
  if (!model) {
    say("  answer   skipped (no model set)");
    return true;
  }

  const started = Date.now();
  const answer: AiResult<Generated> = await provider.generate({
    model,
    system: "You outline web pages for small businesses. Answer only with the requested JSON.",
    messages: [
      {
        role: "user",
        content:
          "Outline a home page for a bakery in Ghent that sells sourdough and pastries. Three sections.",
      },
    ],
    output,
    maxOutputTokens: 2000,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!answer.ok) {
    say(`  answer   failed  ${describe(answer)} after ${seconds}s`);
    return false;
  }
  const { usage } = answer.value;
  const shaped = shapeIsRight(answer.value.value);
  say(
    `  answer   ${shaped ? "ok    " : "WRONG "}  ${answer.value.model}, ${usage.inputTokens} in, ${usage.outputTokens} out, ${seconds}s`,
  );
  if (shaped) {
    say(`           "${(answer.value.value as { title: string }).title}"`);
  }
  return shaped;
}

const env = process.env;
const all = targets(env);
if (all.length === 0) {
  say(
    "Nothing to check: set ANTHROPIC_API_KEY, OPENAI_API_KEY and OPENAI_MODEL, or OLLAMA_URL and OLLAMA_MODEL in this shell.",
  );
  process.exit(1);
}
const allowPrivate = env.AI_ALLOW_PRIVATE_URLS === "true";
let passed = true;
for (const target of all) {
  if (!(await check(target, allowPrivate))) passed = false;
}
process.exit(passed ? 0 : 1);
