import { getEnv } from "@/server/env";
import { redirectTo } from "@/server/http";
import { apiHandler } from "@/server/security/api";
import { readCookie } from "@/server/security/cookies";
import { clearSessionCookieHeader, destroySessionByToken, SESSION_COOKIE } from "@/server/security/session";

function isFormSubmission(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  const accept = req.headers.get("accept") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data") || accept.includes("text/html");
}

/**
 * Sign out: deletes the server-side session and clears the cookie (idempotent).
 * Plain HTML form posts get a 303 redirect to "/"; fetch() callers get 204.
 * The CSRF Origin check still applies (browsers send Origin on form POSTs).
 */
export const POST = apiHandler({ auth: "none", rateLimit: "auth" }, async ({ req }) => {
  await destroySessionByToken(readCookie(req, SESSION_COOKIE));
  if (isFormSubmission(req)) return redirectTo(getEnv().APP_URL, "/", [["Set-Cookie", clearSessionCookieHeader()]]);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookieHeader(), "Cache-Control": "no-store" } });
});
