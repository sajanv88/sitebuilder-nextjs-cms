import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { rateLimit } from "../schema/auth-schema";

// Failed sign-ins per account, next to Better Auth's per-IP limit (design §6.3, decisions #21).
// Kept in Better Auth's rate_limit table under a key of our own, so the count holds across pods
// and restarts. Someone guessing one account's password from many addresses is stopped here.

export const SIGN_IN_LIMIT = { max: 10, windowMs: 15 * 60_000 } as const;

const keyFor = (email: string) => `account-sign-in:${email}`;

// True while the account has had `max` failures, the last of them within the window.
export async function isSignInLocked(
  db: Executor,
  email: string,
  now: number = Date.now(),
): Promise<boolean> {
  const row = await db.query.rateLimit.findFirst({
    where: { key: keyFor(email) },
    columns: { count: true, lastRequest: true },
  });
  return (
    row !== undefined &&
    row.count >= SIGN_IN_LIMIT.max &&
    now - row.lastRequest < SIGN_IN_LIMIT.windowMs
  );
}

// A failure starts a new count once the window since the last one has passed.
export async function recordFailedSignIn(
  db: Executor,
  email: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: keyFor(email), count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${now} - ${rateLimit.lastRequest} >= ${SIGN_IN_LIMIT.windowMs}
          then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: now,
      },
    });
}

export async function clearFailedSignIns(db: Executor, email: string): Promise<void> {
  await db.delete(rateLimit).where(eq(rateLimit.key, keyFor(email)));
}
