import { deleteUserCompletely } from "@/server/auth/account";
import { apiHandler } from "@/server/security/api";
import { clearSessionCookieHeader } from "@/server/security/session";

/** Delete the account: disconnect Gmail + delete user, sessions and preferences. */
export const DELETE = apiHandler({ auth: "user", rateLimit: "auth" }, async ({ user }) => {
  await deleteUserCompletely(user.id);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookieHeader(), "Cache-Control": "no-store" } });
});
