import "server-only";
import { authDatabase } from "@sitebuilder/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@sitebuilder/schema";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { env } from "@/env";
import { ac, roles } from "./access-control";

// Better Auth (design §6, §8.1). Plugins and the rate-limit storage add tables: change them in
// packages/db/auth.config.ts too, then `pnpm --filter @sitebuilder/db db:auth-schema`.
function createAuth() {
  const { SITE_URL, AUTH_SECRET } = env();
  return betterAuth({
    appName: "Sitebuilder",
    // The public domain: both zones serve it, and the admin zone answers /api/auth.
    baseURL: SITE_URL,
    basePath: "/api/auth",
    secret: AUTH_SECRET,
    trustedOrigins: [SITE_URL],
    database: authDatabase,
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // Users are created by /setup and by an admin; there is no public sign-up.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    // No cookie cache: the session (and so the role) is read from Postgres on every request,
    // so a role change takes effect on the user's next request (§6.3).
    session: { cookieCache: { enabled: false } },
    // Stored in Postgres so the limit holds across pods and restarts.
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    plugins: [
      admin({ ac, roles, defaultRole: "author", adminRoles: ["admin"] }),
      // Must stay last: lets Server Actions set Better Auth's cookies.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

// Created on first use, not at import, so `next build` needs no secrets.
export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
