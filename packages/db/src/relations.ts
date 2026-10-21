// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";
import { authRelations } from "./schema/auth-schema";

// All relations in one place (Drizzle relations v2). Better Auth generates its own part
// (authRelations), which must be spread after the full defineRelations result.
const appRelations = defineRelations(schema, (r) => ({
  media: {
    uploader: r.one.user({ from: r.media.uploadedBy, to: r.user.id, optional: false }),
  },
  entries: {
    author: r.one.user({ from: r.entries.authorId, to: r.user.id, optional: false }),
    parent: r.one.entries({ from: r.entries.parentId, to: r.entries.id, alias: "parent" }),
    children: r.many.entries({ from: r.entries.id, to: r.entries.parentId, alias: "parent" }),
    featuredMedia: r.one.media({ from: r.entries.featuredMediaId, to: r.media.id }),
    revisions: r.many.entryRevisions({ from: r.entries.id, to: r.entryRevisions.entryId }),
    terms: r.many.terms({
      from: r.entries.id.through(r.entryTerms.entryId),
      to: r.terms.id.through(r.entryTerms.termId),
    }),
  },
  entryRevisions: {
    entry: r.one.entries({ from: r.entryRevisions.entryId, to: r.entries.id, optional: false }),
    author: r.one.user({ from: r.entryRevisions.createdBy, to: r.user.id, optional: false }),
  },
  terms: {
    entries: r.many.entries({
      from: r.terms.id.through(r.entryTerms.termId),
      to: r.entries.id.through(r.entryTerms.entryId),
    }),
  },
}));

export const relations = { ...appRelations, ...authRelations };
