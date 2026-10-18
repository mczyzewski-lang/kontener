import { NextResponse } from "next/server";
import { appMode } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

/** Starts Google sign-in (Supabase OAuth). The allowed e-mail is checked in /api/auth/confirm. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (appMode() !== "supabase") return NextResponse.redirect(`${origin}/login?error=config`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/api/auth/confirm` },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=oauth`);
  return NextResponse.redirect(data.url);
}
