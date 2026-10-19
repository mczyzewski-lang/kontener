import { NextResponse } from "next/server";
import { appMode } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";
import { SESSION_COOKIE } from "@/lib/auth/password";

export async function POST(req: Request) {
  if (appMode() === "supabase") await (await createUserClient()).auth.signOut();
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
