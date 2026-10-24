// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";

// Shared pieces of the content schemas (design §5.1).

export const Uuid = v.pipe(v.string(), v.uuid());

// Ids of blocks and menu items: generated client-side with nanoid or similar.
export const NodeId = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{8,32}$/));

// A site-relative path, or an absolute http, https, mailto or tel address. Nothing else:
// javascript:, data: and protocol-relative links (//host) are rejected.
export const Url = v.pipe(
  v.string(),
  v.maxLength(2048),
  v.regex(/^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+|tel:[+0-9 ()-]+)$/),
);

// A link target: another entry (follows renames) or a URL.
export const LinkTarget = v.variant("kind", [
  v.object({ kind: v.literal("entry"), entryId: Uuid }),
  v.object({ kind: v.literal("url"), url: Url }),
]);
export type LinkTarget = v.InferOutput<typeof LinkTarget>;

// A secret saved in settings, such as the S3 secret access key or an AI provider's key:
// AES-256-GCM, each part base64url (packages/media and packages/ai seal them).
const base64url = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]+$/));
export const SealedSecret = v.object({ iv: base64url, tag: base64url, data: base64url });
export type SealedSecret = v.InferOutput<typeof SealedSecret>;

// A colour as the colour picker gives it: #rrggbb, lower case. It goes into the page's CSS, so
// nothing else is accepted.
export const HexColor = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^#[0-9a-f]{6}$/, "Choose a colour, such as #f5f0e8"),
);
