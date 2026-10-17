import type { NextRequest } from "next/server";
import { buildAuthRedirect } from "@/server/auth/google-oauth";
import { getEnv } from "@/server/env";
import { redirectTo } from "@/server/http";
import { log } from "@/server/log";
import { takeToken } from "@/server/security/rate-limit";
import { getSessionFromRequest } from "@/server/security/session";

/**
 * Connect Gmail: incremental authorization for gmail.modify (offline access, forced consent so
 * Google returns a refresh token). Requires a signed-in user; login_hint keeps the same account.
 */
export async function GET(req: NextRequest) {
  let appUrl = "/";
  try {
    appUrl = getEnv().APP_URL;
    const session = await getSessionFromRequest(req);
    if (!session) return redirectTo(appUrl, "/?auth_error=not_signed_in");
    if ((await takeToken("auth", session.user.id)) > 0) return redirectTo(appUrl, "/app/connect?error=rate_limited");
    const { url, cookie } = await buildAuthRedirect("connect", { userId: session.user.id, loginHint: session.user.email });
    return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch (e) {
    log.error("oauth_connect_start_failed", { code: (e as Error).name });
    return appUrl === "/" ? Response.json({ error: { code: "server", message: "Server is misconfigured" } }, { status: 500 }) : redirectTo(appUrl, "/app/connect?error=server");
  }
}
