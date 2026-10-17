/**
 * CSRF defence for cookie-authenticated mutating requests: the Origin (or, failing that, the
 * Referer) must match APP_URL's origin. In development localhost / 127.0.0.1 on any port are
 * accepted as well. Webhook and cron routes are exempt (they authenticate differently).
 * Combined with SameSite=Lax session cookies this blocks cross-site form posts and fetches.
 */
import { getEnv, isProduction } from "../env";
import { ApiError } from "../errors";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string, appOrigin: string, production: boolean): boolean {
  if (origin === appOrigin) return true;
  if (!production) {
    try {
      const u = new URL(origin);
      return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    } catch {
      return false;
    }
  }
  return false;
}

export function assertSameOrigin(req: Request): void {
  if (!MUTATING.has(req.method.toUpperCase())) return;
  const origin = originOf(req.headers.get("origin")) ?? originOf(req.headers.get("referer"));
  if (!origin || !isAllowedOrigin(origin, getEnv().appOrigin, isProduction())) {
    throw new ApiError("unauthorized", "Cross-origin request rejected", 403);
  }
}
