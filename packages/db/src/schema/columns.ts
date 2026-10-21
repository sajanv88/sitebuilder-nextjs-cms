// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { timestamp, uuid } from "drizzle-orm/pg-core";

// Column builders shared by our tables. Better Auth's tables (auth-schema.ts) are generated and
// use their own.

// Our ids are uuids. Better Auth's ids are text, so every reference to a user is a text column.
export const id = () => uuid().primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const optionalTimestamp = () => timestamp({ withTimezone: true, mode: "date" });
