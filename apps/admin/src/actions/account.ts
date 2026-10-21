"use server";

import { ChangePasswordInput, PersonName } from "@sitebuilder/schema";
import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import * as v from "valibot";
import { auth } from "@/auth/auth";
import { getViewer } from "@/auth/session";

// My account: every signed-in user may change their own name and password (design §6.1). No
// permission is needed; Better Auth acts on the session's own user only.

export interface AccountState {
  result: "idle" | "saved" | "invalid" | "failed";
  message?: string;
  errors?: Partial<Record<"name" | "currentPassword" | "newPassword", string>>;
  savedAt?: number;
}

export async function updateName(_: AccountState, form: FormData): Promise<AccountState> {
  if (!(await getViewer())) return { result: "failed", message: "Your session has ended." };
  const name = v.safeParse(PersonName, form.get("name"));
  if (!name.success) {
    return { result: "invalid", errors: { name: name.issues[0]?.message ?? "Enter a name" } };
  }
  await auth().api.updateUser({ body: { name: name.output }, headers: await headers() });
  return { result: "saved", message: "Name saved.", savedAt: Date.now() };
}

// Needs the current password, and signs out every other session.
export async function changePassword(_: AccountState, form: FormData): Promise<AccountState> {
  if (!(await getViewer())) return { result: "failed", message: "Your session has ended." };
  const input = v.safeParse(ChangePasswordInput, {
    currentPassword: form.get("currentPassword"),
    newPassword: form.get("newPassword"),
  });
  if (!input.success) {
    const nested = v.flatten<typeof ChangePasswordInput>(input.issues).nested ?? {};
    return {
      result: "invalid",
      errors: {
        ...(nested.currentPassword?.[0] ? { currentPassword: nested.currentPassword[0] } : {}),
        ...(nested.newPassword?.[0] ? { newPassword: nested.newPassword[0] } : {}),
      },
    };
  }
  try {
    await auth().api.changePassword({
      body: { ...input.output, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return {
        result: "invalid",
        errors: { currentPassword: "That isn't your current password." },
      };
    }
    throw error;
  }
  return {
    result: "saved",
    message: "Password changed. Your other sessions are signed out.",
    savedAt: Date.now(),
  };
}
