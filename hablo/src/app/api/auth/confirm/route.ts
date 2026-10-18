import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isEmailAllowed } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

/** Completes magic-link (PKCE code or token_hash) and OAuth sign-in, then enforces the allowlist. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = await createUserClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return NextResponse.redirect(`${url.origin}/login?error=link`);
  const { data } = await supabase.auth.getUser();
  if (!isEmailAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${url.origin}/login?error=forbidden`);
  }
  return NextResponse.redirect(`${url.origin}/`);
}
