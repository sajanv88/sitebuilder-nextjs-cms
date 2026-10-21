import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "./client";
import { account, rateLimit, session, user, verification } from "./schema/auth-schema";

// Better Auth's database, built here so drizzle-orm stays inside packages/db. The admin zone
// passes it to betterAuth({ database }). The db carries authRelations (relations.ts).
export const authDatabase = drizzleAdapter(db, {
  provider: "pg",
  schema: { user, session, account, verification, rateLimit },
});
