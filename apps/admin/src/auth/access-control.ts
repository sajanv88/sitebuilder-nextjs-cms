import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { permissions, type Role, statements } from "./permissions";

// permissions.ts registered with Better Auth's admin plugin, so its own user-management
// endpoints (create, list, set-role, ban, ...) obey the same table (design §6.4). Content
// resources keep our action names; the `user` resource is translated to Better Auth's names.
// Impersonation is granted to nobody.

const { user: _user, ...contentStatements } = statements;

export const ac = createAccessControl({ ...contentStatements, ...defaultStatements });

// Our user actions → the Better Auth admin endpoints each one allows.
const userGrants = {
  create: ["create"],
  read: ["list", "get"],
  update: ["update", "ban", "set-password", "set-email"],
  delete: ["delete"],
  setRole: ["set-role"],
} as const;

type BetterAuthUserAction = (typeof userGrants)[keyof typeof userGrants][number];

function roleFor(role: Role) {
  const { user: ours = [], ...content } = permissions[role] as (typeof permissions)["admin"];
  const user: BetterAuthUserAction[] = ours.flatMap((grant) => [...userGrants[grant]]);
  const session: ("list" | "revoke" | "delete")[] = ours.some((grant) => grant === "update")
    ? ["list", "revoke", "delete"]
    : [];
  return ac.newRole({ ...content, user, session });
}

export const roles = {
  admin: roleFor("admin"),
  editor: roleFor("editor"),
  author: roleFor("author"),
};
