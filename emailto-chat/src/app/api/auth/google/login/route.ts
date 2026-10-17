import type { NextRequest } from "next/server";
import { buildAuthRedirect } from "@/server/auth/google-oauth";
import { getEnv } from "@/server/env";
import { redirectTo } from "@/server/http";
import { log } from "@/server/log";
import { clientIp, takeToken } from "@/server/security/rate-limit";

/** Start Google sign-in (openid email profile). No Gmail permission is requested here. */
export async function GET(req: NextRequest) {
  let appUrl = "/";
  try {
    appUrl = getEnv().APP_URL;
    if ((await takeToken("auth", `ip:${clientIp(req)}`)) > 0) return redirectTo(appUrl, "/?auth_error=rate_limited");
    const { url, cookie } = await buildAuthRedirect("login");
    return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch (e) {
    log.error("oauth_login_start_failed", { code: (e as Error).name });
    return appUrl === "/" ? new Response(null, { status: 302, headers: { Location: "/?auth_error=not_configured", "Cache-Control": "no-store" } }) : redirectTo(appUrl, "/?auth_error=server");
  }
}
