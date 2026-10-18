import { NextResponse } from "next/server";
import { z } from "zod";
import { appMode, isEmailAllowed } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

/** Sends a magic link — only to the single allowed e-mail. The answer is identical either way. */
export async function POST(req: Request) {
  if (appMode() !== "supabase") return NextResponse.json({ error: "Logowanie wymaga konfiguracji Supabase." }, { status: 503 });
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
