// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use server";

import { randomBytes } from "node:crypto";
import { can } from "@sitebuilder/auth";
import { WELCOME_PATH } from "@sitebuilder/auth/server";
import { db, deleteUser, getUserSummary, setUserBanned, setUserRole } from "@sitebuilder/db";
import { NewUserInput, Password, RoleSchema, UserId } from "@sitebuilder/schema";
import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import * as v from "valibot";
import { auth } from "@/auth/auth";
import { getViewer, type Viewer } from "@/auth/session";
import { currentMail, mailFailureOf } from "@/server/mail";

// The Users screen (design §6, §6.3), admin only by the permissions table. Creating a user and
// setting a password go through Better Auth's admin endpoints, which hash the password and
// write the account; its own access check runs too. Role, ban and delete go through our queries,
// which hold the lock that keeps the last admin (decisions #33).

export type UserActionResult = { ok: true; message: string } | { ok: false; error: string };

const LAST_ADMIN = "This is the last admin. Make someone else an admin first.";
const SESSION_ENDED: UserActionResult = {
  ok: false,
  error: "Your session has ended. Sign in again.",
};
const NOT_ALLOWED: UserActionResult = { ok: false, error: "You can't change users." };

// ── Create ───────────────────────────────────────────────────────────────────────────────────

export interface NewUserState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  errors?: Partial<Record<"name" | "email" | "role" | "password", string>>;
  // What was typed, never the password: React resets a form after its action runs.
  values: { name: string; email: string; role: string };
  savedAt?: number;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.slice(0, 254) : "";
}

export async function createUser(_: NewUserState, form: FormData): Promise<NewUserState> {
  const values = { name: text(form, "name"), email: text(form, "email"), role: text(form, "role") };
  const fail = (
    result: NewUserState["result"],
    message: string,
    errors?: NewUserState["errors"],
  ): NewUserState => ({ result, message, values, ...(errors ? { errors } : {}) });

  const viewer = await getViewer();
  if (!viewer) return fail("failed", "Your session has ended. Sign in again.");
  if (!can(viewer, "user.create")) return fail("failed", "You can't add users.");

  // Invited: a password nobody knows, and an email with a link to choose one (decisions #147).
  const invite = form.get("invite") === "on";
  if (invite && !(await currentMail()).ok) {
    return fail(
      "failed",
      "Email isn't set up, so the invitation can't be sent. Set a password instead.",
    );
  }
  const password = invite ? randomBytes(32).toString("base64url") : form.get("password");
  const input = v.safeParse(NewUserInput, { ...values, password });
  if (!input.success) {
    const nested = v.flatten<typeof NewUserInput>(input.issues).nested ?? {};
    return fail("invalid", "Check the fields marked below.", {
      ...(nested.name?.[0] ? { name: nested.name[0] } : {}),
      ...(nested.email ? { email: "Enter a valid email address" } : {}),
      ...(nested.role?.[0] ? { role: nested.role[0] } : {}),
      ...(nested.password?.[0] ? { password: nested.password[0] } : {}),
    });
  }

  try {
    await auth().api.createUser({
      body: {
        name: input.output.name,
        email: input.output.email,
        password: input.output.password,
        role: input.output.role,
      },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error) && error.body?.code?.startsWith("USER_ALREADY_EXISTS")) {
      return fail("invalid", "Check the fields marked below.", {
        email: "Someone already has this email address.",
      });
    }
    throw error;
  }
  if (invite) {
    const sent = await emailPasswordLink(input.output.email);
    return {
      result: "saved",
      message: sent.ok
        ? `Added ${input.output.name}. An email with a link to choose their password is on its way.`
        : `Added ${input.output.name}, but the email couldn't be sent: ${sent.error} Send it again from their row once email works.`,
      values: { name: "", email: "", role: "author" },
      savedAt: Date.now(),
    };
  }
  return {
    result: "saved",
    message: `Added ${input.output.name}. Give them their password yourself.`,
    values: { name: "", email: "", role: "author" },
    savedAt: Date.now(),
  };
}

// ── Change ───────────────────────────────────────────────────────────────────────────────────

async function actor(
  action: "user.setRole" | "user.update" | "user.delete",
): Promise<Viewer | UserActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  return can(viewer, action) ? viewer : NOT_ALLOWED;
}

function isResult(value: Viewer | UserActionResult): value is UserActionResult {
  return "ok" in value;
}

export async function changeRole(input: unknown): Promise<UserActionResult> {
  const viewer = await actor("user.setRole");
  if (isResult(viewer)) return viewer;
  const parsed = v.safeParse(v.object({ userId: UserId, role: RoleSchema }), input);
  if (!parsed.success) return { ok: false, error: "Choose a role." };
  const result = await setUserRole(db, parsed.output.userId, parsed.output.role);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "last-admin" ? LAST_ADMIN : "That user no longer exists.",
    };
  }
  return { ok: true, message: "Role changed. It applies from their next click." };
}

export async function changeBan(input: unknown): Promise<UserActionResult> {
  const viewer = await actor("user.update");
  if (isResult(viewer)) return viewer;
  const parsed = v.safeParse(v.object({ userId: UserId, banned: v.boolean() }), input);
  if (!parsed.success) return { ok: false, error: "Nothing to change." };
  // Banning yourself would sign you out with no way back in.
  if (parsed.output.banned && parsed.output.userId === viewer.id) {
    return { ok: false, error: "You can't ban yourself." };
  }
  const result = await setUserBanned(db, parsed.output.userId, parsed.output.banned);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "last-admin" ? LAST_ADMIN : "That user no longer exists.",
    };
  }
  return {
    ok: true,
    message: parsed.output.banned ? "Banned and signed out." : "They can sign in again.",
  };
}

export async function removeUser(input: unknown): Promise<UserActionResult> {
  const viewer = await actor("user.delete");
  if (isResult(viewer)) return viewer;
  const parsed = v.safeParse(
    v.object({ userId: UserId, reassignTo: v.union([v.literal(""), UserId]) }),
    input,
  );
  if (!parsed.success) return { ok: false, error: "Nothing to change." };
  if (parsed.output.userId === viewer.id) {
    return { ok: false, error: "You can't delete your own account here." };
  }
  const result = await deleteUser(db, parsed.output.userId, parsed.output.reassignTo || null);
  if (result.ok) return { ok: true, message: "User deleted." };
  const errors = {
    "not-found": "That user no longer exists.",
    "last-admin": LAST_ADMIN,
    "has-content": "They have posts, pages or uploads. Choose who gets them.",
    "invalid-reassign": "Choose someone else to give their content to.",
  } as const;
  return { ok: false, error: errors[result.error] };
}

// A link to choose a password, by email: Better Auth makes the token, Settings → Email sends it.
async function emailPasswordLink(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await auth().api.requestPasswordReset({ body: { email, redirectTo: WELCOME_PATH } });
    return { ok: true };
  } catch (error) {
    const why = mailFailureOf(error);
    if (why) return { ok: false, error: `${why.charAt(0).toUpperCase()}${why.slice(1)}.` };
    throw error;
  }
}

// From a user's row: an email with a link to choose a password, instead of setting one for them.
export async function sendPasswordLink(input: unknown): Promise<UserActionResult> {
  const viewer = await actor("user.update");
  if (isResult(viewer)) return viewer;
  const parsed = v.safeParse(v.object({ userId: UserId }), input);
  if (!parsed.success) return { ok: false, error: "That user wasn't found." };
  const user = await getUserSummary(db, parsed.output.userId);
  if (!user) return { ok: false, error: "That user wasn't found." };
  if (!(await currentMail()).ok) return { ok: false, error: "Email isn't set up." };
  const sent = await emailPasswordLink(user.email);
  return sent.ok
    ? { ok: true, message: `A link to choose a password is on its way to ${user.email}.` }
    : { ok: false, error: `The email couldn't be sent: ${sent.error}` };
}

export async function setPassword(input: unknown): Promise<UserActionResult> {
  const viewer = await actor("user.update");
  if (isResult(viewer)) return viewer;
  const parsed = v.safeParse(v.object({ userId: UserId, password: Password }), input);
  if (!parsed.success) {
    return {
      ok: false,
      error: v.flatten(parsed.issues).nested?.password?.[0] ?? "Enter a password.",
    };
  }
  await auth().api.setUserPassword({
    body: { userId: parsed.output.userId, newPassword: parsed.output.password },
    headers: await headers(),
  });
  return { ok: true, message: "Password set. Tell them the new one yourself." };
}
