// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import {
  authDatabase,
  clearFailedSignIns,
  db,
  isSignInLocked,
  recordFailedSignIn,
} from "@sitebuilder/db";
import { Email, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@sitebuilder/schema";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import * as v from "valibot";
import { ac, roles } from "./access-control";

const SignInBody = v.object({ email: Email });

// The account a sign-in is for, from the request body. Undefined for anything else.
function signInEmail(path: string, body: unknown): string | undefined {
  if (path !== "/sign-in/email") return undefined;
  const parsed = v.safeParse(SignInBody, body);
  return parsed.success ? parsed.output.email : undefined;
}

// How long a password link lasts, a reset's or an invitation's (decisions #147). One lifetime for
// both: Better Auth has one. Each link works once.
export const PASSWORD_LINK_HOURS = 24;

// Where an invitation's link lands: the reset page, saying "choose your password".
export const WELCOME_PATH = "/admin/set-password?welcome=1";

export interface PasswordLinkEmail {
  user: { email: string; name: string };
  url: string;
  // An invitation (its link lands on WELCOME_PATH), not a reset someone asked for.
  invitation: boolean;
  // Sent by an admin through the server (no request of its own): a failure can be told to
  // them, where one from the public form must not say whether the address has an account.
  fromAdmin: boolean;
}

export interface AuthConfig {
  // The public domain: both zones serve it, and the admin zone answers /api/auth.
  siteUrl: string;
  secret: string;
  // The header with the client's address (CLIENT_IP_HEADER). Undefined keeps Better Auth's
  // default, x-forwarded-for, trusted only when it holds a single address.
  clientIpHeader?: string | undefined;
  // Sends a password link (the admin zone, which answers /api/auth). Without it, resets are off.
  sendPasswordLink?: ((email: PasswordLinkEmail) => Promise<void>) | undefined;
}

// Better Auth (design §6, §8.1), the same for both zones: the admin signs people in, the site
// reads the session for preview (decisions #66). Plugins and the rate-limit storage add
// tables: change them in packages/db/auth.config.ts too, then
// `pnpm --filter @sitebuilder/db db:auth-schema`.
export function createAuth({
  siteUrl: SITE_URL,
  secret: AUTH_SECRET,
  clientIpHeader,
  sendPasswordLink,
}: AuthConfig) {
  return betterAuth({
    appName: "Sitebuilder",
    // The public domain: both zones serve it, and the admin zone answers /api/auth.
    baseURL: SITE_URL,
    basePath: "/api/auth",
    secret: AUTH_SECRET,
    trustedOrigins: [SITE_URL],
    database: authDatabase,
    telemetry: { enabled: false },
    // Next keeps a client's own X-Forwarded-For (decisions #74), so the per-IP limit holds only
    // behind a proxy that overwrites the header named here.
    ...(clientIpHeader ? { advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } } } : {}),
    emailAndPassword: {
      enabled: true,
      // Users are created by /setup and by an admin; there is no public sign-up.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Password links by email (decisions #147). Better Auth answers a request the same way
      // whether or not the address has an account, so nobody learns which do.
      ...(sendPasswordLink
        ? {
            sendResetPassword: async ({ user, url }, request) => {
              await sendPasswordLink({
                user: { email: user.email, name: user.name },
                url,
                invitation: url.includes(encodeURIComponent(WELCOME_PATH)),
                fromAdmin: request === undefined,
              });
            },
            resetPasswordTokenExpiresIn: PASSWORD_LINK_HOURS * 3600,
            // A new password signs the account out everywhere else.
            revokeSessionsOnPasswordReset: true,
          }
        : {}),
    },
    // No cookie cache: the session (and so the role) is read from Postgres on every request,
    // so a role change takes effect on the user's next request (§6.3).
    session: { cookieCache: { enabled: false } },
    // Stored in Postgres so the limit holds across pods and restarts.
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        // Asking for links, and trying tokens, per address.
        "/request-password-reset": { window: 600, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    // Failed sign-ins are also counted per account (decisions #21, #37): 10 within 15 minutes
    // locks the account's sign-in until 15 minutes after the last one. A success clears it.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email = signInEmail(ctx.path, ctx.body);
        if (email && (await isSignInLocked(db, email))) {
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "ACCOUNT_LOCKED",
            message: "Too many failed attempts for this account. Try again in 15 minutes.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const email = signInEmail(ctx.path, ctx.body);
        if (!email) return;
        const returned = ctx.context.returned;
        if (isAPIError(returned)) {
          if (returned.statusCode === 401) await recordFailedSignIn(db, email);
        } else {
          await clearFailedSignIns(db, email);
        }
      }),
    },
    plugins: [
      admin({ ac, roles, defaultRole: "author", adminRoles: ["admin"] }),
      // Must stay last: lets Server Actions set Better Auth's cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
