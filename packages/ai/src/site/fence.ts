// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { randomBytes } from "node:crypto";

// Text a person typed, or a template author wrote, goes to the model as data, never as
// instructions (phase 8 plan, "Prompt security"). Each piece is put in its own data block with
// a boundary chosen at random for the request, so text inside can't close the block and speak
// as the prompt: it would have to guess the boundary.

// Characters that aren't text: C0 and C1 controls except tab and newline, and the Unicode
// formatting characters that can hide or reorder text (zero-width characters, bidirectional
// overrides and isolates, the byte order mark).
function hidden(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

// Clean text for a prompt: hidden characters out, line ends as \n, at most `max` characters.
export function cleanText(text: string, max: number): string {
  const cleaned = [...text.normalize("NFC").replace(/\r\n?/g, "\n")]
    .filter((char) => !hidden(char.codePointAt(0) ?? 0))
    .join("")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export interface Fence {
  // The boundary for this request, also named in the system prompt.
  boundary: string;
  // One piece of data, cleaned and fenced.
  data(name: string, text: string, max: number): string;
}

export function fence(boundary = randomBytes(9).toString("base64url")): Fence {
  return {
    boundary,
    data(name, text, max) {
      // A data tag inside the text, opening or closing, is taken out, whatever its case.
      const body = cleanText(text, max).replace(/<\s*\/?\s*data\b[^>]*>?/gi, "");
      return `<data name="${name}" boundary="${boundary}">\n${body}\n</data boundary="${boundary}">`;
    },
  };
}
