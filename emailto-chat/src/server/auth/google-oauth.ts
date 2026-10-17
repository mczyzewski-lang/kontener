/**
 * Google OAuth 2.0 (Authorization Code + PKCE + state).
 * Sign-in (openid email profile) is separate from the Gmail connection (gmail.modify), so users
 * can sign in without granting mail access and we can explain the permission before asking.
 */
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { getEnv, isProduction } from "../env";
import { readCookie, serializeCookie } from "../security/cookies";
import { randomToken, signJson, verifySignedJson } from "../security/crypto";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const LOGIN_SCOPES = ["openid", "email", "profile"];
/** openid+email are included so the response carries an id_token whose `sub` we can compare. */
export const CONNECT_SCOPES = ["openid", "email", GMAIL_SCOPE];

export const OAUTH_COOKIE = "etc_oauth";
const OAUTH_COOKIE_PATH = "/api/auth/google";
const STATE_TTL_SEC = 600;

export type OAuthIntent = "login" | "connect";

export interface OAuthState {
  intent: OAuthIntent;
  state: string;
  verifier: string;
  /** connect only: the signed-in user who started the flow. */
  userId?: string;
  exp: number;
}

export function createOAuthClient(): OAuth2Client {
  const env = getEnv();
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.googleRedirectUri,
  });
}

export async function buildAuthRedirect(
  intent: OAuthIntent,
  opts: { userId?: string; loginHint?: string } = {},
): Promise<{ url: string; cookie: string }> {
  const client = createOAuthClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = randomToken(24);
  const url = client.generateAuthUrl(
    intent === "login"
      ? {
          scope: LOGIN_SCOPES,
          access_type: "online",
          prompt: "select_account",
          state,
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
        }
      : {
          scope: CONNECT_SCOPES,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: true,
          login_hint: opts.loginHint,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
        },
  );
  const payload: OAuthState = {
    intent,
    state,
    verifier: codeVerifier!,
    userId: opts.userId,
    exp: Date.now() + STATE_TTL_SEC * 1000,
  };
  const cookie = serializeCookie(OAUTH_COOKIE, signJson(payload), {
    maxAge: STATE_TTL_SEC,
    path: OAUTH_COOKIE_PATH,
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
  });
  return { url, cookie };
}

export function clearOAuthCookie(): string {
  return serializeCookie(OAUTH_COOKIE, "", { maxAge: 0, path: OAUTH_COOKIE_PATH, httpOnly: true, secure: isProduction(), sameSite: "lax" });
}

/** Read + verify the signed state cookie and compare the `state` parameter (constant time inside verify). */
export function readOAuthState(req: Request, stateParam: string | null): OAuthState | null {
  const data = verifySignedJson<OAuthState>(readCookie(req, OAUTH_COOKIE));
  if (!data || !stateParam || data.state !== stateParam || data.exp < Date.now()) return null;
  return data;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface ExchangedTokens {
  identity: GoogleIdentity;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
  scopes: string[];
}

export async function exchangeCode(code: string, verifier: string): Promise<ExchangedTokens> {
  const env = getEnv();
  const client = createOAuthClient();
  const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: env.googleRedirectUri });
  if (!tokens.id_token) throw new Error("oauth_no_id_token");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error("oauth_bad_id_token");
  return {
    identity: {
      sub: p.sub,
      email: p.email.toLowerCase(),
      emailVerified: !!p.email_verified,
      name: p.name ?? null,
      picture: p.picture ?? null,
    },
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean),
  };
}

/** Best effort: revoke a token at Google (refresh token revokes the whole grant). */
export async function revokeGoogleToken(token: string): Promise<void> {
  const client = createOAuthClient();
  await client.revokeToken(token);
}
