import { NextResponse } from "next/server";
import { z } from "zod";
import { appMode, isEmailAllowed } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";
import { passwordConfig } from "@/lib/session";
import { SESSION_COOKIE, SESSION_DAYS, checkCredentials, createSessionToken, isRateLimited, recordFailure } from "@/lib/auth/password";

/**
 * Supabase mode: sends a magic link — only to the single allowed e-mail; the answer is identical either way.
 * Postgres mode: checks the allowed e-mail + HABLO_PASSWORD and sets a signed session cookie.
 */
export async function POST(req: Request) {
  const mode = appMode();
  if (mode === "postgres") return passwordLogin(req);
  if (mode !== "supabase") return NextResponse.json({ error: "Logowanie wymaga konfiguracji bazy danych." }, { status: 503 });
  const parsed = z.object({ email: z.string().email() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Podaj poprawny adres e-mail." }, { status: 400 });
  const generic = { ok: true, message: "Jeśli ten adres ma dostęp do Hablo, za chwilę dostaniesz link do logowania." };
  if (!isEmailAllowed(parsed.data.email)) return NextResponse.json(generic);
  const origin = new URL(req.url).origin;
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin}/api/auth/confirm`, shouldCreateUser: true },
  });
  if (error) return NextResponse.json({ error: "Nie udało się wysłać linku. Spróbuj ponownie za chwilę." }, { status: 502 });
  return NextResponse.json(generic);
}

async function passwordLogin(req: Request) {
  const cfg = passwordConfig()!;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isRateLimited(ip)) return NextResponse.json({ error: "Zbyt wiele prób. Spróbuj ponownie za kilkanaście minut." }, { status: 429 });
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1).max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Podaj e-mail i hasło." }, { status: 400 });
  if (!checkCredentials(parsed.data.email, parsed.data.password, cfg)) {
    recordFailure(ip);
    return NextResponse.json({ error: "Nieprawidłowy e-mail lub hasło." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, redirect: "/" });
  res.cookies.set(SESSION_COOKIE, createSessionToken(cfg), {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
