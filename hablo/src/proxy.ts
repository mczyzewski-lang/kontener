import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and sends signed-out visitors to
 * /login. This is only the first line of defence: every page and API route
 * re-checks the session AND the allowed e-mail on the server (lib/session.ts).
 */
const PUBLIC = ["/login", "/auth", "/setup", "/api/auth", "/api/elevenlabs/webhook", "/api/health", "/manifest.webmanifest", "/sw.js", "/offline"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Demo / unconfigured mode: the server-side session layer decides.
  if (!url || !key || !process.env.HABLO_ALLOWED_EMAIL) return NextResponse.next();

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
  if (!data.user && !PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|jpg|webp|ico|mp3)$).*)"],
};
