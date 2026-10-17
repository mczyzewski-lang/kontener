/**
 * Cloud Pub/Sub push verification + payload decoding for Gmail notifications.
 *
 * Verification (at least one must be configured, otherwise the endpoint answers 503):
 *  - PUBSUB_SERVICE_ACCOUNT_EMAIL: the push subscription signs an OIDC JWT
 *    (`Authorization: Bearer …`); we verify it with google-auth-library against PUBSUB_AUDIENCE and
 *    require `email` == that service account and `email_verified`.
 *  - PUBSUB_VERIFICATION_TOKEN: a shared secret in the push URL (`?token=…`).
 */
import { OAuth2Client } from "google-auth-library";
import { getEnv } from "../env";
import { safeEqual } from "../security/crypto";

export type PushVerification = "ok" | "unauthorized" | "not_configured";

let oidcClient: OAuth2Client | null = null;

export async function verifyPubSubPush(req: Request): Promise<PushVerification> {
  const env = getEnv();
  const sa = env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  const token = env.PUBSUB_VERIFICATION_TOKEN;
  if (!sa && !token) return "not_configured";

  if (token) {
    const given = new URL(req.url).searchParams.get("token") ?? "";
    if (!safeEqual(given, token)) return "unauthorized";
  }
  if (sa) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return "unauthorized";
    try {
      oidcClient ??= new OAuth2Client();
      const ticket = await oidcClient.verifyIdToken({ idToken: m[1], audience: env.PUBSUB_AUDIENCE });
      const p = ticket.getPayload();
      if (!p || p.email !== sa || !p.email_verified) return "unauthorized";
    } catch {
      return "unauthorized";
    }
  }
  return "ok";
}

export interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export function decodePushBody(body: unknown): GmailNotification | null {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== "string" || data.length > 10_000) return null;
  try {
    const json = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { emailAddress?: unknown; historyId?: unknown };
    if (typeof json.emailAddress !== "string" || (typeof json.historyId !== "string" && typeof json.historyId !== "number")) return null;
    return { emailAddress: json.emailAddress.toLowerCase(), historyId: String(json.historyId) };
  } catch {
    return null;
  }
}
