import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign-in for the plain-Postgres mode: the single allowed e-mail plus
 * HABLO_PASSWORD, and an HMAC-signed, HttpOnly session cookie. Changing the
 * password, the allowed e-mail or HABLO_SESSION_SECRET signs every device out.
 */
export const SESSION_COOKIE = "hablo_session";
export const SESSION_DAYS = 60;

function secret(password: string, explicit?: string): Buffer {
  return createHash("sha256")
    .update(explicit ?? `hablo-session:${password}`)
    .digest();
}

function sign(email: string, exp: number, key: Buffer): string {
  return createHmac("sha256", key).update(`${email}|${exp}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function checkCredentials(email: string, password: string, cfg: { allowedEmail: string; password: string }): boolean {
  // Evaluate both so the response time does not reveal which one was wrong.
  const okEmail = safeEqual(email.trim().toLowerCase(), cfg.allowedEmail);
  const okPassword = safeEqual(password, cfg.password);
  return okEmail && okPassword;
}

export function createSessionToken(cfg: { allowedEmail: string; password: string; secret?: string }, now = Date.now()): string {
  const exp = now + SESSION_DAYS * 86_400_000;
  return `${exp}.${sign(cfg.allowedEmail, exp, secret(cfg.password, cfg.secret))}`;
}

export function verifySessionToken(
  token: string | undefined,
  cfg: { allowedEmail: string; password: string; secret?: string },
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, sign(cfg.allowedEmail, exp, secret(cfg.password, cfg.secret)));
}

/** Stable user id for the one account (profiles.id is a uuid). */
export function userIdForEmail(email: string): string {
  const h = createHash("sha256").update(`hablo-user:${email.trim().toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Slows down password guessing: at most 10 failed attempts per 15 minutes per address. */
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
const MAX_FAILURES = 10;

export function isRateLimited(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()) {
  failures.set(key, [...(failures.get(key) ?? []).filter((t) => now - t < WINDOW), now]);
}
