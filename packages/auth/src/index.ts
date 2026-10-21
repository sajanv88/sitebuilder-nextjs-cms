// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Who may do what (design §6), for both zones: the role table and the one can() check. Better
// Auth itself is in "@sitebuilder/auth/server" (decisions #66).

export { type Action, type Actor, can, canSome, type Resource } from "./can";
export { permissions, type ResourceType, ROLES, type Role, statements } from "./permissions";
