// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  codeForStatus,
  count,
  errorFor,
  fail,
  field,
  parseAnswer,
  type Reply,
  send,
  text,
} from "./http";
import type { AiErrorCode, AiProvider, AiResult, FetchLike } from "./types";

// Ollama's own API, not its OpenAI-compatible one: /api/chat takes the JSON schema as `format`
// and reports token counts, and /api/tags lists the models the server has. The same adapter
// reaches a server on this machine, one elsewhere, and Ollama's cloud (https://ollama.com, with
// a key).

function headers(key: string | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };
}

function errorCode(reply: Reply): AiErrorCode {
  const message = text(field(reply.body, "error")) ?? "";
  if (reply.status === 404 || /model .*not found/i.test(message)) return "model";
  return codeForStatus(reply.status);
}

const failure = <T>(reply: Reply, key: string | undefined): AiResult<T> => ({
  ok: false,
  error: errorFor(reply, errorCode(reply), text(field(reply.body, "error")), [key]),
});

export function ollamaProvider(
  baseUrl: string,
  key: string | undefined,
  fetch: FetchLike,
): AiProvider {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    name: "ollama",

    async listModels(signal) {
      const sent = await send(
        fetch,
        `${base}/api/tags`,
        { headers: headers(key), ...(signal ? { signal } : {}) },
        [key],
      );
      if (!sent.ok) return sent;
      const reply = sent.value;
      if (reply.status !== 200) return failure(reply, key);
      const models = field(reply.body, "models");
      const names = (Array.isArray(models) ? models : [])
        .map((model) => text(field(model, "name")) ?? text(field(model, "model")))
        .filter((name): name is string => name !== undefined)
        .sort();
      return { ok: true, value: names.map((id) => ({ id, label: id })) };
    },

    async generate(request) {
      const body = {
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          // Pictures in the message's own images list, base64.
          ...request.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.images?.length ? { images: message.images.map((i) => i.data) } : {}),
          })),
        ],
        format: request.output.schema,
        stream: false,
        // A thinking model (qwen3.5, deepseek-r1) would spend the output budget thinking before
        // any JSON, and on local hardware that's slow: qwen3.5 9B ran out of 2,000 tokens after
        // 53 s thinking, and answered in 8 s without. Models that don't think ignore it.
        think: false,
        options: { num_predict: request.maxOutputTokens },
      };
      const sent = await send(
        fetch,
        `${base}/api/chat`,
        {
          method: "POST",
          headers: headers(key),
          body: JSON.stringify(body),
          ...(request.signal ? { signal: request.signal } : {}),
        },
        [key],
      );
      if (!sent.ok) return sent;
      const reply = sent.value;
      if (reply.status !== 200) return failure(reply, key);
      if (text(field(reply.body, "done_reason")) === "length") {
        return fail("invalid_output", "The answer was cut off.");
      }
      const parsed = parseAnswer(text(field(reply.body, "message", "content")) ?? "");
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        value: {
          value: parsed.value,
          usage: {
            inputTokens: count(field(reply.body, "prompt_eval_count")),
            outputTokens: count(field(reply.body, "eval_count")),
          },
          model: text(field(reply.body, "model")) ?? request.model,
        },
      };
    },
  };
}
