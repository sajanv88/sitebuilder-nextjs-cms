import { count } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";

// Better Auth owns writes to its tables, except the first-admin bootstrap (queries/bootstrap.ts).

export async function countUsers(db: Executor): Promise<number> {
  const [row] = await db.select({ value: count() }).from(user);
  return row?.value ?? 0;
}
