// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Every table file, re-exported. drizzle-kit reads the schema from here (drizzle.config.ts),
// and so does defineRelations.
export * from "./auth-schema";
export * from "./entries";
export * from "./entry-revisions";
export * from "./media";
export * from "./site";
export * from "./terms";
