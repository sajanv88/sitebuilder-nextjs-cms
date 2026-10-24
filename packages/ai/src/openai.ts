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

// OpenAI's chat completions, with plain fetch through the outbound guard (B2), and the answer's
// shape from a JSON schema (response_format json_schema; strict when the schema allows it).

const API = "https://api.openai.com/v1";

function headers(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

function errorCode(reply: Reply): AiErrorCode {
  const code = text(field(reply.body, "error", "code"));
  if (code === "insufficient_quota") return "quota";
  if (code === "model_not_found") return "model";
  if (code === "context_length_exceeded") return "too_large";
  if (code === "invalid_api_key") return "auth";
  return codeForStatus(reply.status);
}

const failure = <T>(reply: Reply, key: string): AiResult<T> => ({
  ok: false,
  error: errorFor(reply, errorCode(reply), text(field(reply.body, "error", "message")), [key]),
});

// The model list has every kind of model; these can't write a page.
const NOT_FOR_TEXT =
  /(embedding|whisper|tts|dall-e|davinci|babbage|moderation|transcribe|audio|realtime|image|search|sora|computer-use)/i;

export function openaiProvider(key: string, fetch: FetchLike): AiProvider {
  return {
    name: "openai",

    async listModels(signal) {
      const sent = await send(
        fetch,
        `${API}/models`,
        { headers: headers(key), ...(signal ? { signal } : {}) },
        [key],
      );
      if (!sent.ok) return sent;
      const reply = sent.value;
      if (reply.status !== 200) return failure(reply, key);
      const data = field(reply.body, "data");
      const ids = (Array.isArray(data) ? data : [])
        .map((model) => text(field(model, "id")))
        .filter((id): id is string => id !== undefined && !NOT_FOR_TEXT.test(id))
        .sort();
      return { ok: true, value: ids.map((id) => ({ id, label: id })) };
    },

    async generate(request) {
      const body = {
        model: request.model,
        max_completion_tokens: request.maxOutputTokens,
        messages: [
          { role: "system", content: request.system },
          // Pictures as data: URLs in image_url parts, before the text.
          ...request.messages.map((message) =>
            message.images?.length
              ? {
                  role: message.role,
                  content: [
                    ...message.images.map((image) => ({
                      type: "image_url",
                      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
                    })),
                    { type: "text", text: message.content },
                  ],
                }
              : { role: message.role, content: message.content },
          ),
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.output.name,
            schema: request.output.schema,
            strict: request.output.strict ?? false,
          },
        },
      };
      const sent = await send(
        fetch,
        `${API}/chat/completions`,
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

      const choice = field(reply.body, "choices", 0);
      const refusal = text(field(choice, "message", "refusal"));
      const finish = text(field(choice, "finish_reason"));
      if (refusal || finish === "content_filter") return fail("refused", refusal);
      if (finish === "length") return fail("invalid_output", "The answer was cut off.");
      const parsed = parseAnswer(text(field(choice, "message", "content")) ?? "");
      if (!parsed.ok) return parsed;
      const usage = field(reply.body, "usage");
      return {
        ok: true,
        value: {
          value: parsed.value,
          usage: {
            inputTokens: count(field(usage, "prompt_tokens")),
            outputTokens: count(field(usage, "completion_tokens")),
          },
          model: text(field(reply.body, "model")) ?? request.model,
        },
      };
    },
  };
}
