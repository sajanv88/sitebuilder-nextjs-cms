import { createAuthClient } from "better-auth/react";

// Browser side of Better Auth. Sign-in and sign-out go through its HTTP endpoints, not a Server
// Action calling auth.api, because only requests to the handler get its origin check and its
// rate limit. No baseURL: the page's own origin, which is the public domain.
export const authClient = createAuthClient({ basePath: "/api/auth" });
