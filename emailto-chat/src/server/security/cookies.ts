/** Minimal Cookie header parsing / Set-Cookie building (works with plain Request objects). */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

export function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${o.path ?? "/"}`);
  if (o.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
    parts.push(`Expires=${new Date(Date.now() + o.maxAge * 1000).toUTCString()}`);
  }
  if (o.httpOnly) parts.push("HttpOnly");
  if (o.secure) parts.push("Secure");
  if (o.sameSite) parts.push(`SameSite=${o.sameSite.charAt(0).toUpperCase()}${o.sameSite.slice(1)}`);
  return parts.join("; ");
}
