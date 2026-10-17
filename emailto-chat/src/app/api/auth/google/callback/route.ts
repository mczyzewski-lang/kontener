import type { NextRequest } from "next/server";
import { getMailAccount, upsertConnectedAccount } from "@/server/auth/account";
import { clearOAuthCookie, exchangeCode, GMAIL_SCOPE, readOAuthState } from "@/server/auth/google-oauth";
import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { redirectTo, runAfter } from "@/server/http";
import { errorCode, log } from "@/server/log";
import { createSession, getSessionFromRequest, sessionCookieHeader } from "@/server/security/session";
import { runSync } from "@/server/sync/engine";
import { ensureWatch } from "@/server/sync/watch";

export const maxDuration = 30;

/** OAuth callback for both sign-in and Gmail connection (intent comes from the signed state cookie). */
export async function GET(req: NextRequest) {
  const env = getEnv();
  const clear: [string, string] = ["Set-Cookie", clearOAuthCookie()];
  const params = req.nextUrl.searchParams;
  const state = readOAuthState(req, params.get("state"));
  const fail = (path: string) => redirectTo(env.APP_URL, path, [clear]);

  // Without a valid state we cannot know the intent; the landing page shows a generic error.
  if (!state) return fail("/?auth_error=invalid_state");
  const errorPath = state.intent === "connect" ? "/app/connect?error=" : "/?auth_error=";
  if (params.get("error")) return fail(`${errorPath}${params.get("error") === "access_denied" ? "access_denied" : "oauth_failed"}`);
  const code = params.get("code");
  if (!code) return fail(`${errorPath}oauth_failed`);

  let tokens;
  try {
    tokens = await exchangeCode(code, state.verifier);
  } catch (e) {
    log.warn("oauth_exchange_failed", { intent: state.intent, code: errorCode(e) });
    return fail(`${errorPath}oauth_failed`);
  }
  const id = tokens.identity;

  if (state.intent === "login") {
    if (!id.emailVerified) return fail("/?auth_error=email_unverified");
    const user = await db.user.upsert({
      where: { googleSub: id.sub },
      create: { googleSub: id.sub, email: id.email, name: id.name, image: id.picture },
      update: { email: id.email, name: id.name, image: id.picture },
    });
    const { token } = await createSession(user.id, req.headers.get("user-agent"));
    const account = await getMailAccount(user.id);
    log.info("login_ok", { userId: user.id });
    return redirectTo(env.APP_URL, account?.status === "active" ? "/app" : "/app/connect", [
      clear,
      ["Set-Cookie", sessionCookieHeader(token)],
    ]);
  }

  // intent = connect
  const session = await getSessionFromRequest(req);
  if (!session || session.user.id !== state.userId) return fail("/?auth_error=not_signed_in");
  if (!tokens.scopes.includes(GMAIL_SCOPE)) return fail("/app/connect?error=scope_denied");
  if (id.sub !== session.user.googleSub) return fail("/app/connect?error=account_mismatch");

  try {
    const { account, isNew } = await upsertConnectedAccount({
      userId: session.user.id,
      googleSub: id.sub,
      emailAddress: id.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiryDate: tokens.expiryDate,
      scopes: tokens.scopes,
    });
    log.info("gmail_connected", { userId: session.user.id, accountId: account.id, isNew });
    // Kick off the initial sync without blocking the redirect; the client also polls /api/sync.
    await runAfter(async () => {
      await runSync(account.id, { budgetMs: 8000 });
      await ensureWatch(account);
    });
    return redirectTo(env.APP_URL, "/app", [clear]);
  } catch (e) {
    log.warn("gmail_connect_failed", { userId: session.user.id, code: errorCode(e) });
    return fail("/app/connect?error=oauth_failed");
  }
}
