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
import type { AiErrorCode, AiModel, AiProvider, AiResult, FetchLike } from "./types";

// Anthropic's Messages API, with plain fetch through the outbound guard (B2). The answer's shape
// comes from structured output (output_config.format with a JSON schema), which constrains the
// reply to the schema. The system prompt is marked for caching: it's the stable part (B6).

const API = "https://api.anthropic.com/v1";
const VERSION = "2026-10-21";

function headers(key: string): Record<string, string> {
  return { "x-api-key": key, "anthropic-version": VERSION, "content-type": "application/json" };
}

// Anthropic's error types, which say more than the status does.
function errorCode(reply: Reply): AiErrorCode {
  const type = text(field(reply.body, "error", "type"));
  const message = text(field(reply.body, "error", "message")) ?? "";
  if (type === "authentication_error" || type === "permission_error") return "auth";
  if (type === "billing_error" || /credit balance/i.test(message)) return "quota";
  if (type === "rate_limit_error") return "rate_limited";
  if (type === "overloaded_error" || type === "api_error") return "unavailable";
  if (type === "request_too_large") return "too_large";
  if (type === "not_found_error") return "model";
  return codeForStatus(reply.status);
}

const failure = <T>(reply: Reply, key: string): AiResult<T> => ({
  ok: false,
  error: errorFor(reply, errorCode(reply), text(field(reply.body, "error", "message")), [key]),
});

export function anthropicProvider(key: string, fetch: FetchLike): AiProvider {
  return {
    name: "anthropic",

    async listModels(signal) {
      const models: AiModel[] = [];
      let after: string | undefined;
      // A few pages at most: the list is short.
      for (let page = 0; page < 5; page++) {
        const query = `limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`;
        const sent = await send(
          fetch,
          `${API}/models?${query}`,
          { headers: headers(key), ...(signal ? { signal } : {}) },
          [key],
        );
        if (!sent.ok) return sent;
        const reply = sent.value;
        if (reply.status !== 200) return failure(reply, key);
        const data = field(reply.body, "data");
        for (const model of Array.isArray(data) ? data : []) {
          const id = text(field(model, "id"));
          if (id) models.push({ id, label: text(field(model, "display_name")) ?? id });
        }
        after = text(field(reply.body, "last_id"));
        if (field(reply.body, "has_more") !== true || !after) break;
      }
      return { ok: true, value: models };
    },

    async generate(request) {
      const body = {
        model: request.model,
        max_tokens: request.maxOutputTokens,
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        // Pictures as image blocks before the text, as the Messages API takes them.
        messages: request.messages.map((message) =>
          message.images?.length
            ? {
                role: message.role,
                content: [
                  ...message.images.map((image) => ({
                    type: "image",
                    source: { type: "base64", media_type: image.mediaType, data: image.data },
                  })),
                  { type: "text", text: message.content },
                ],
              }
            : { role: message.role, content: message.content },
        ),
        output_config: { format: { type: "json_schema", schema: request.output.schema } },
      };
      const sent = await send(
        fetch,
        `${API}/messages`,
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

      const stop = text(field(reply.body, "stop_reason"));
      if (stop === "refusal") {
        return fail("refused", text(field(reply.body, "stop_details", "explanation")));
      }
      if (stop === "max_tokens") return fail("invalid_output", "The answer was cut off.");
      const content = field(reply.body, "content");
      const answer = (Array.isArray(content) ? content : []).find(
        (block) => field(block, "type") === "text",
      );
      const parsed = parseAnswer(text(field(answer, "text")) ?? "");
      if (!parsed.ok) return parsed;
      const usage = field(reply.body, "usage");
      return {
        ok: true,
        value: {
          value: parsed.value,
          // Every input token counts towards the daily limit, cached or not.
          usage: {
            inputTokens:
              count(field(usage, "input_tokens")) +
              count(field(usage, "cache_creation_input_tokens")) +
              count(field(usage, "cache_read_input_tokens")),
            outputTokens: count(field(usage, "output_tokens")),
          },
          model: text(field(reply.body, "model")) ?? request.model,
        },
      };
    },
  };
}
