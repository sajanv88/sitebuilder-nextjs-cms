// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it } from "vitest";
import { OutboundError } from "./outbound-error";
import { createProvider, withRetries } from "./provider";
import type { AiConnection, FetchInit, FetchLike, GenerateRequest } from "./types";

// Each adapter against answers recorded in the providers' documented shapes. No test calls a
// real model (B12); scripts/ai-live-check.ts does that by hand.

interface Call {
  url: string;
  init: FetchInit;
}

function fake(...replies: (Response | Error)[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (!reply) throw new Error("no reply recorded");
    if (reply instanceof Error) throw reply;
    return reply.clone();
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const KEY = "sk-test-0123456789abcdefghij";
const anthropic: AiConnection = { provider: "anthropic", key: KEY };
const openai: AiConnection = { provider: "openai", key: KEY };
const ollama: AiConnection = { provider: "ollama", baseUrl: "http://localhost:11434/" };

const request: GenerateRequest = {
  model: "the-model",
  system: "You write pages.",
  messages: [{ role: "user", content: "A bakery in Ghent." }],
  output: { name: "page", schema: { type: "object", properties: { title: { type: "string" } } } },
  maxOutputTokens: 4000,
};

const body = (call: Call | undefined) => JSON.parse(call?.init.body ?? "null");

describe("Anthropic", () => {
  it("sends the key, the API version, the schema and a cached system prompt", async () => {
    const { fetch, calls } = fake(
      json({
        model: "the-model",
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: '{"title":"Bakery"}' },
        ],
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 5,
          output_tokens: 20,
        },
      }),
    );
    const result = await createProvider(anthropic, fetch).generate(request);
    expect(result).toEqual({
      ok: true,
      value: {
        value: { title: "Bakery" },
        usage: { inputTokens: 115, outputTokens: 20 },
        model: "the-model",
      },
    });
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.init.headers).toMatchObject({
      "x-api-key": KEY,
      "anthropic-version": "2026-10-21",
    });
    expect(body(call)).toMatchObject({
      model: "the-model",
      max_tokens: 4000,
      system: [{ type: "text", text: "You write pages.", cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: request.output.schema } },
    });
  });

  it("lists models across pages", async () => {
    const { fetch, calls } = fake(
      json({
        data: [{ id: "claude-a", display_name: "Claude A" }],
        has_more: true,
        last_id: "claude-a",
      }),
      json({
        data: [{ id: "claude-b", display_name: "Claude B" }],
        has_more: false,
        last_id: "claude-b",
      }),
    );
    const result = await createProvider(anthropic, fetch).listModels();
    expect(result).toEqual({
      ok: true,
      value: [
        { id: "claude-a", label: "Claude A" },
        { id: "claude-b", label: "Claude B" },
      ],
    });
    expect(calls[1]?.url).toContain("after_id=claude-a");
  });

  it.each([
    [401, "authentication_error", "invalid x-api-key", "auth"],
    [403, "permission_error", "not allowed", "auth"],
    [402, "billing_error", "payment required", "quota"],
    [400, "invalid_request_error", "Your credit balance is too low", "quota"],
    [429, "rate_limit_error", "slow down", "rate_limited"],
    [529, "overloaded_error", "Overloaded", "unavailable"],
    [500, "api_error", "Internal error", "unavailable"],
    [413, "request_too_large", "too big", "too_large"],
    [404, "not_found_error", "model: nope", "model"],
    [400, "invalid_request_error", "max_tokens: too large", "bad_request"],
  ])("HTTP %i %s is %s", async (status, type, message, code) => {
    const { fetch } = fake(json({ type: "error", error: { type, message } }, status));
    const result = await createProvider(anthropic, fetch).generate(request);
    expect(result).toMatchObject({ ok: false, error: { code: expect.stringMatching(code) } });
  });

  it("reads Retry-After on a rate limit", async () => {
    const { fetch } = fake(
      json({ type: "error", error: { type: "rate_limit_error", message: "slow" } }, 429, {
        "retry-after": "7",
      }),
    );
    const result = await createProvider(anthropic, fetch).generate(request);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", retryAfterMs: 7000 },
    });
  });

  it("reports a refusal, a cut-off answer and an answer that isn't JSON", async () => {
    const refusal = fake(
      json({ stop_reason: "refusal", stop_details: { explanation: "no" }, content: [] }),
    );
    expect(await createProvider(anthropic, refusal.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "refused" },
    });
    const cut = fake(
      json({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"ti' }] }),
    );
    expect(await createProvider(anthropic, cut.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "invalid_output" },
    });
    const prose = fake(
      json({ stop_reason: "end_turn", content: [{ type: "text", text: "Sure!" }] }),
    );
    expect(await createProvider(anthropic, prose.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "invalid_output" },
    });
  });

  it("never puts the key in an error's detail", async () => {
    const { fetch } = fake(
      json(
        { type: "error", error: { type: "authentication_error", message: `bad key ${KEY}` } },
        401,
      ),
    );
    const result = await createProvider(anthropic, fetch).generate(request);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("OpenAI", () => {
  it("sends the schema as response_format, and reads the answer and the usage", async () => {
    const { fetch, calls } = fake(
      json({
        model: "gpt-x",
        choices: [{ finish_reason: "stop", message: { content: '{"title":"Bakery"}' } }],
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      }),
    );
    const result = await createProvider(openai, fetch).generate({
      ...request,
      output: { ...request.output, strict: true },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        value: { title: "Bakery" },
        usage: { inputTokens: 30, outputTokens: 12 },
        model: "gpt-x",
      },
    });
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(body(calls[0])).toMatchObject({
      max_completion_tokens: 4000,
      messages: [{ role: "system", content: "You write pages." }, request.messages[0]],
      response_format: {
        type: "json_schema",
        json_schema: { name: "page", schema: request.output.schema, strict: true },
      },
    });
  });

  it("lists the models that can write, sorted", async () => {
    const { fetch } = fake(
      json({
        data: [
          { id: "gpt-b" },
          { id: "text-embedding-3-small" },
          { id: "gpt-a" },
          { id: "whisper-1" },
        ],
      }),
    );
    expect(await createProvider(openai, fetch).listModels()).toEqual({
      ok: true,
      value: [
        { id: "gpt-a", label: "gpt-a" },
        { id: "gpt-b", label: "gpt-b" },
      ],
    });
  });

  it.each([
    [401, "invalid_api_key", "auth"],
    [429, "insufficient_quota", "quota"],
    [429, "rate_limit_exceeded", "rate_limited"],
    [404, "model_not_found", "model"],
    [400, "context_length_exceeded", "too_large"],
    [503, null, "unavailable"],
  ])("HTTP %i %s is %s", async (status, code, expected) => {
    const { fetch } = fake(json({ error: { message: "nope", code } }, status));
    expect(await createProvider(openai, fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: expected },
    });
  });

  it("reports a refusal and a cut-off answer", async () => {
    const refusal = fake(
      json({ choices: [{ finish_reason: "stop", message: { refusal: "I can't" } }] }),
    );
    expect(await createProvider(openai, refusal.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "refused" },
    });
    const cut = fake(json({ choices: [{ finish_reason: "length", message: { content: "{" } }] }));
    expect(await createProvider(openai, cut.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "invalid_output" },
    });
  });
});

describe("Ollama", () => {
  it("posts to /api/chat with the schema as format, and reads the counts", async () => {
    const { fetch, calls } = fake(
      json({
        model: "llama3.2",
        message: { role: "assistant", content: '```json\n{"title":"Bakery"}\n```' },
        done_reason: "stop",
        prompt_eval_count: 40,
        eval_count: 15,
      }),
    );
    const result = await createProvider(ollama, fetch).generate(request);
    expect(result).toEqual({
      ok: true,
      value: {
        value: { title: "Bakery" },
        usage: { inputTokens: 40, outputTokens: 15 },
        model: "llama3.2",
      },
    });
    expect(calls[0]?.url).toBe("http://localhost:11434/api/chat");
    expect(calls[0]?.init.headers).not.toHaveProperty("authorization");
    expect(body(calls[0])).toMatchObject({
      format: request.output.schema,
      stream: false,
      think: false,
      options: { num_predict: 4000 },
    });
  });

  it("sends a key only when there is one", async () => {
    const { fetch, calls } = fake(json({ models: [] }));
    await createProvider(
      { provider: "ollama", baseUrl: "https://ollama.com", key: KEY },
      fetch,
    ).listModels();
    expect(calls[0]?.url).toBe("https://ollama.com/api/tags");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
  });

  it("lists the server's models", async () => {
    const { fetch } = fake(json({ models: [{ name: "qwen3:8b" }, { name: "llama3.2:latest" }] }));
    expect(await createProvider(ollama, fetch).listModels()).toEqual({
      ok: true,
      value: [
        { id: "llama3.2:latest", label: "llama3.2:latest" },
        { id: "qwen3:8b", label: "qwen3:8b" },
      ],
    });
  });

  it("reports a missing model, a cut-off answer, and a server that can't be reached", async () => {
    const missing = fake(json({ error: "model 'nope' not found" }, 404));
    expect(await createProvider(ollama, missing.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "model" },
    });
    const cut = fake(json({ message: { content: "{" }, done_reason: "length" }));
    expect(await createProvider(ollama, cut.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "invalid_output" },
    });
    const down = fake(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    expect(await createProvider(ollama, down.fetch).generate(request)).toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
  });

  it("passes the guard's refusal on as blocked_url", async () => {
    const { fetch } = fake(new OutboundError("blocked_url", "Refused: a private address."));
    expect(await createProvider(ollama, fetch).listModels()).toMatchObject({
      ok: false,
      error: { code: "blocked_url" },
    });
  });
});

describe("pictures", () => {
  const withImage: GenerateRequest = {
    ...request,
    messages: [
      {
        role: "user",
        content: "Describe it.",
        images: [{ mediaType: "image/png", data: "iVBORw0KGgo" }],
      },
    ],
  };

  it("go to each provider in its own shape, before the text", async () => {
    const a = fake(
      json({
        model: "m",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    await createProvider(anthropic, a.fetch).generate(withImage);
    expect(body(a.calls[0]).messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo" },
          },
          { type: "text", text: "Describe it." },
        ],
      },
    ]);

    const o = fake(
      json({
        model: "m",
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    await createProvider(openai, o.fetch).generate(withImage);
    expect(body(o.calls[0]).messages[1]).toEqual({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo" } },
        { type: "text", text: "Describe it." },
      ],
    });

    const l = fake(
      json({ model: "m", message: { content: "{}" }, done_reason: "stop", eval_count: 1 }),
    );
    await createProvider(ollama, l.fetch).generate(withImage);
    expect(body(l.calls[0]).messages[1]).toEqual({
      role: "user",
      content: "Describe it.",
      images: ["iVBORw0KGgo"],
    });
  });

  it("leave a message without pictures as plain text", async () => {
    const o = fake(
      json({
        model: "m",
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    await createProvider(openai, o.fetch).generate(request);
    expect(body(o.calls[0]).messages[1]).toEqual(request.messages[0]);
  });
});

describe("retries", () => {
  const noWait = { sleep: async () => {} };
  const limited = () =>
    json({ type: "error", error: { type: "rate_limit_error", message: "slow" } }, 429);
  const outage = () =>
    json({ type: "error", error: { type: "overloaded_error", message: "busy" } }, 529);
  const fine = () =>
    json({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }], usage: {} });

  it("retries a rate limit twice, then gives up", async () => {
    const { fetch, calls } = fake(limited(), limited(), limited(), fine());
    const result = await withRetries(createProvider(anthropic, fetch), noWait).generate(request);
    expect(result).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(calls).toHaveLength(3);
  });

  it("retries an outage and succeeds", async () => {
    const { fetch, calls } = fake(outage(), fine());
    const result = await withRetries(createProvider(anthropic, fetch), noWait).generate(request);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("retries a timeout once", async () => {
    const { fetch, calls } = fake(
      new OutboundError("timeout", "slow"),
      new OutboundError("timeout", "slow"),
    );
    const result = await withRetries(createProvider(anthropic, fetch), noWait).generate(request);
    expect(result).toMatchObject({ ok: false, error: { code: "timeout" } });
    expect(calls).toHaveLength(2);
  });

  it("doesn't retry a rejected key", async () => {
    const { fetch, calls } = fake(
      json({ type: "error", error: { type: "authentication_error", message: "bad" } }, 401),
    );
    await withRetries(createProvider(anthropic, fetch), noWait).generate(request);
    expect(calls).toHaveLength(1);
  });

  it("waits as long as Retry-After says", async () => {
    const waits: number[] = [];
    const { fetch } = fake(
      json({ type: "error", error: { type: "rate_limit_error", message: "slow" } }, 429, {
        "retry-after": "3",
      }),
      fine(),
    );
    await withRetries(createProvider(anthropic, fetch), {
      sleep: async (ms) => {
        waits.push(ms);
      },
    }).generate(request);
    expect(waits).toEqual([3000]);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const { fetch } = fake(outage(), fine());
    const result = await withRetries(createProvider(anthropic, fetch), {
      sleep: async () => controller.abort(),
    }).generate({ ...request, signal: controller.signal });
    expect(result).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });
});
