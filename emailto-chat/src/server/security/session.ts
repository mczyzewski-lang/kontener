/**
 * Cookie sessions. The cookie `etc_session` holds a random 32-byte token; the DB stores only
 * sha256(token) as the Session id, so a database leak does not leak usable sessions.
 * Sliding expiry: 30 days, extended at most once per day.
 */
import type { User } from "@prisma/client";
import { db } from "../db";
import { isProduction } from "../env";
import { ApiError } from "../errors";
import { readCookie, serializeCookie } from "./cookies";
import { randomToken, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "etc_session";
export const SESSION_TTL_SEC = 30 * 24 * 3600;
const SLIDE_AFTER_MS = 24 * 3600 * 1000;

export interface SessionContext {
  sessionId: string;
  token: string;
  user: User;
  /** True when the expiry was extended — the caller should re-send the cookie. */
  refreshed: boolean;
}

export function sessionCookieHeader(token: string, maxAge = SESSION_TTL_SEC): string {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge,
    path: "/",
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
  });
}

export function clearSessionCookieHeader(): string {
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true, secure: isProduction(), sameSite: "lax" });
}

export async function createSession(userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000);
  await db.session.create({
    data: { id: sha256Hex(token), userId, expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  return { token, expiresAt };
}

export async function getSessionFromToken(token: string | null | undefined): Promise<SessionContext | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const id = sha256Hex(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  let refreshed = false;
  if (now - session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    refreshed = true;
    await db.session
      .update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_SEC * 1000) } })
      .catch(() => undefined);
  }
  return { sessionId: id, token, user: session.user, refreshed };
}

export function getSessionFromRequest(req: Request): Promise<SessionContext | null> {
  return getSessionFromToken(readCookie(req, SESSION_COOKIE));
}

/** For server components / server actions (uses next/headers). */
export async function getSession(): Promise<SessionContext | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return getSessionFromToken(store.get(SESSION_COOKIE)?.value);
}

/** Server components: returns the user or null. Route handlers: use apiHandler({ auth: "user" }). */
export async function getCurrentUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

export async function requireUser(req?: Request): Promise<User> {
  const s = req ? await getSessionFromRequest(req) : await getSession();
  if (!s) throw new ApiError("unauthorized", "Not signed in");
  return s.user;
}

export async function destroySessionByToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sha256Hex(token) } });
}
