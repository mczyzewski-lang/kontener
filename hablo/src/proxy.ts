import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/password";

/**
 * Refreshes the Supabase session cookie and sends signed-out visitors to
 * /login. This is only the first line of defence: every page and API route
 * re-checks the session AND the allowed e-mail on the server (lib/session.ts).
 */
const PUBLIC = ["/login", "/auth", "/setup", "/api/auth", "/api/elevenlabs/webhook", "/api/health", "/manifest.webmanifest", "/sw.js", "/offline"];

function isPublic(path: string) {
  return PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

function toLogin(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmail = process.env.HABLO_ALLOWED_EMAIL?.trim().toLowerCase();
  const password = process.env.HABLO_PASSWORD?.trim();
  if ((!url || !key) && process.env.DATABASE_URL && allowedEmail && password) {
    // Postgres mode: signed session cookie.
    const ok = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, {
      allowedEmail,
      password,
      secret: process.env.HABLO_SESSION_SECRET?.trim() || undefined,
    });
    return ok || isPublic(request.nextUrl.pathname) ? NextResponse.next() : toLogin(request);
  }
  // Demo / unconfigured mode: the server-side session layer decides.
  if (!url || !key || !allowedEmail) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && !isPublic(path)) return toLogin(request);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|jpg|webp|ico|mp3)$).*)"],
};
