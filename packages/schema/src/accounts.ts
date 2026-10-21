// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import * as v from "valibot";

// Account input shared by /setup, the create-admin script and Better Auth's own limits
// (design §6.3: passwords are 12 to 128 characters).

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const Email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254));

export const Password = v.pipe(
  v.string(),
  v.minLength(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`),
  v.maxLength(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
);

export const PersonName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Enter a name"),
  v.maxLength(200),
);

// The three roles (design §6), stored in Better Auth's `user.role`. What each may do is the
// admin zone's permissions.ts.
export const ROLES = ["admin", "editor", "author"] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = v.picklist(ROLES, "Choose a role");

export const NewAdminInput = v.object({ name: PersonName, email: Email, password: Password });
export type NewAdminInput = v.InferOutput<typeof NewAdminInput>;

// A user made by an admin on the Users screen.
export const NewUserInput = v.object({
  name: PersonName,
  email: Email,
  role: RoleSchema,
  password: Password,
});
export type NewUserInput = v.InferOutput<typeof NewUserInput>;

// Signed-in users changing their own password: the current one proves it's them.
export const ChangePasswordInput = v.object({
  currentPassword: v.pipe(
    v.string(),
    v.minLength(1, "Enter your current password"),
    v.maxLength(PASSWORD_MAX_LENGTH),
  ),
  newPassword: Password,
});
export type ChangePasswordInput = v.InferOutput<typeof ChangePasswordInput>;

export const SignInInput = v.object({
  email: Email,
  password: v.pipe(
    v.string(),
    v.minLength(1, "Enter your password"),
    v.maxLength(PASSWORD_MAX_LENGTH),
  ),
});
export type SignInInput = v.InferOutput<typeof SignInInput>;
