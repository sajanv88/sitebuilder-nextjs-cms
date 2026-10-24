// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { AiErrorCode } from "./types";

// Why the outbound guard didn't return an answer: a refused address or redirect, no answer in
// time, a network failure, or an answer too large to be one (invalid_output).
export class OutboundError extends Error {
  readonly code: Extract<AiErrorCode, "blocked_url" | "timeout" | "unavailable" | "invalid_output">;

  constructor(code: OutboundError["code"], message: string) {
    super(message);
    this.name = "OutboundError";
    this.code = code;
  }
}
